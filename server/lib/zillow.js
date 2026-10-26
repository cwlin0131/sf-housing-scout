/**
 * Normalises the two Zillow page shapes into one listing record.
 *
 *  /apartments/<city>/<slug>/<id>/   whole building, units live in `gdp.building.floorPlans`
 *  /homedetails/<slug>/<zpid>_zpid/  single unit, fields live in a stringified GraphQL cache
 *
 * Field paths below were read off real pages rather than documentation, so guard every
 * access: Zillow changes its internal shape without notice and a missing branch should
 * degrade to null, not throw.
 */

export function isZillowUrl(s) {
  return /^https?:\/\/(www\.)?zillow\.com\//i.test(s.trim());
}

export function normalize(nextData, url) {
  const building = nextData?.props?.pageProps?.componentProps?.initialReduxState?.gdp?.building;
  if (building) return fromBuilding(building, url);

  const cacheStr = nextData?.props?.pageProps?.componentProps?.gdpClientCache;
  if (cacheStr) {
    let property = null;
    try {
      const cache = JSON.parse(cacheStr);
      property = Object.values(cache).find((v) => v && v.property)?.property || null;
    } catch { /* fall through */ }
    if (property) return fromProperty(property, url);
  }
  return null;
}

function unitType(beds, baths) {
  if (beds === 0) return 'studio';
  if (beds === 1 && baths != null && baths <= 1.5) return '1b1b';
  if (beds == null) return null;
  return `${beds}b`;
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function fromBuilding(b, url) {
  // Buildings list several floor plans. Pick the cheapest that a single person would take,
  // preferring studio / one bed, so the score reflects a unit he would actually rent.
  const plans = Array.isArray(b.floorPlans) ? b.floorPlans : [];
  const wanted = plans.filter((p) => (p.beds ?? 9) <= 1);
  const pool = wanted.length ? wanted : plans;
  const plan = pool.slice().sort((a, c) => (a.minPrice ?? 1e9) - (c.minPrice ?? 1e9))[0] || null;

  const addr = b.address || {};
  const attrs = b.buildingAttributes || {};

  return {
    source: 'zillow',
    source_id: String(b.zpid ?? b.lotId ?? ''),
    url,
    title: b.buildingName || b.streetAddress || null,
    address: [b.streetAddress || addr.streetAddress, addr.city || b.city, addr.state || b.state, addr.zipcode || b.zipcode]
      .filter(Boolean)
      .join(', '),
    zip: addr.zipcode || b.zipcode || null,
    neighborhood: addr.neighborhood || null,
    lat: num(b.latitude),
    lng: num(b.longitude),

    beds: num(plan?.beds),
    baths: num(plan?.baths),
    sqft: num(plan?.sqft),
    unit_type: unitType(num(plan?.beds), num(plan?.baths)),

    price: num(plan?.minPrice ?? plan?.minBaseRent),
    monthly_fees: num(plan?.totalRequiredMonthlyMinFee),
    deposit: num(attrs.depositFeeMin),
    lease_term: plan?.leaseTerm || (Array.isArray(attrs.leaseTerms) ? attrs.leaseTerms.join(', ') : null),
    pets: Array.isArray(plan?.allowedPets) ? plan.allowedPets.join(', ')
      : Array.isArray(attrs.petPolicies) ? attrs.petPolicies.join(', ') : null,
    parking: attrs.parkingDescription || (Array.isArray(attrs.parkingTypes) ? attrs.parkingTypes.join(', ') : null),
    laundry: attrs.hasSharedLaundry ? 'Shared' : Array.isArray(attrs.appliances) && attrs.appliances.some((a) => /washer|dryer/i.test(a)) ? 'In unit' : null,
    furnished: null,
    // "0" is Zillow's way of saying available now.
    available_from: plan?.availableFrom && plan.availableFrom !== '0' ? plan.availableFrom : 'now',
    // Apartment building pages usually carry no posting date at all; when one does, take it.
    ...listedFrom({ ...attrs, ...(plan || {}) }),

    walk_score: num(b.walkScore?.walkscore ?? b.walkScore),
    transit_score: num(b.transitScore?.transit_score ?? b.transitScore),
    bike_score: num(b.bikeScore?.bikescore ?? b.bikeScore),

    description: b.description || null,
    refreshable: 1,
    _shape: 'building',
    _unitCount: num(attrs.unitCount),
  };
}

/**
 * When did this go up? Zillow states it several ways depending on the page, so try the
 * exact date first and fall back to the day count, recording which one was used.
 *
 * Converted to an absolute date on the spot. Keeping "12 days" would mean the listing
 * looks twelve days old forever, which is worse than not recording it at all.
 */
export function listedFrom(src = {}) {
  const exact = src.datePostedString || src.datePosted;
  if (exact) {
    const d = typeof exact === 'number' ? new Date(exact) : new Date(String(exact));
    if (!Number.isNaN(d.getTime())) return { listed_at: d.toISOString().slice(0, 10), listed_basis: 'date' };
  }
  // "5 days on Zillow", "1 day", or a bare number depending on the shape.
  const raw = src.daysOnZillow ?? src.timeOnZillow ?? src.daysOnMarket;
  const days = typeof raw === 'number' ? raw : Number(String(raw ?? '').match(/-?\d+/)?.[0]);
  if (Number.isFinite(days) && days >= 0 && days < 3650) {
    const d = new Date(Date.now() - days * 86400e3);
    return { listed_at: d.toISOString().slice(0, 10), listed_basis: 'days' };
  }
  return { listed_at: null, listed_basis: null };
}

function fromProperty(p, url) {
  const reso = p.resoFacts || {};
  return {
    source: 'zillow',
    source_id: String(p.zpid ?? ''),
    url,
    title: p.streetAddress || null,
    address: [p.streetAddress, p.city, p.state, p.zipcode].filter(Boolean).join(', '),
    zip: p.zipcode || null,
    neighborhood: p.neighborhoodRegion?.regionName || null,
    lat: num(p.latitude),
    lng: num(p.longitude),

    beds: num(p.bedrooms),
    baths: num(p.bathrooms),
    sqft: num(p.livingArea ?? p.livingAreaValue),
    unit_type: unitType(num(p.bedrooms), num(p.bathrooms)),

    price: num(p.price),
    monthly_fees: null,
    deposit: null,
    lease_term: reso.leaseTerm || null,
    pets: reso.petsAllowed ? String(reso.petsAllowed) : null,
    parking: Array.isArray(reso.parkingFeatures) && reso.parkingFeatures.length
      ? reso.parkingFeatures.join(', ')
      : reso.hasGarage ? 'Garage' : null,
    laundry: Array.isArray(reso.laundryFeatures) ? reso.laundryFeatures.join(', ') : null,
    furnished: reso.furnished === true ? 1 : reso.furnished === false ? 0 : null,
    available_from: reso.availabilityDate
      ? new Date(Number(reso.availabilityDate)).toISOString().slice(0, 10)
      : null,
    ...listedFrom({ ...p, ...reso }),

    walk_score: null,
    transit_score: null,
    bike_score: null,

    description: p.description || null,
    refreshable: 1,
    _shape: 'property',
    _homeStatus: p.homeStatus || null,
  };
}

/** Used by the refresh pass to decide whether a saved listing has gone away. */
export function stillListed(nextData) {
  const b = nextData?.props?.pageProps?.componentProps?.initialReduxState?.gdp?.building;
  if (b) {
    const plans = Array.isArray(b.floorPlans) ? b.floorPlans : [];
    return { live: plans.length > 0, status: plans.length ? 'FOR_RENT' : 'NO_UNITS' };
  }
  const cacheStr = nextData?.props?.pageProps?.componentProps?.gdpClientCache;
  if (cacheStr) {
    try {
      const property = Object.values(JSON.parse(cacheStr)).find((v) => v && v.property)?.property;
      if (property) return { live: property.homeStatus === 'FOR_RENT', status: property.homeStatus };
    } catch { /* unknown shape */ }
  }
  return { live: false, status: 'UNKNOWN' };
}

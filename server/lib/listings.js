import { db } from './db.js';
import { distanceMetres, geocode } from './geo.js';
import { scoreListing, priceScore } from './scoring.js';
import { writeReview } from './review.js';
import { settings } from './settings.js';
import { fail } from './errors.js';
import { fetchZillow } from './fetcher.js';
import { normalize, isZillowUrl, stillListed } from './zillow.js';
import { extractFromImages } from './vision.js';
import { commuteFor } from './commute.js';

/**
 * Turning an input into a scored candidate, and the housekeeping around the saved list.
 *
 * A candidate is scored and shown before anything is committed. Nothing is ever deleted:
 * dropped listings stay as `rejected` so the duplicate check can say "you looked at this
 * in July and passed", and listings that disappear become `deactivated` rather than
 * vanishing, so the list keeps working as a benchmark.
 */

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(apartment|apt|unit|suite|ste)\b/g, '')
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(san francisco|sf|ca|california)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Three passes, strictest first: same listing id, same address, then same spot and shape. */
export function findDuplicates(candidate) {
  const hits = [];
  const seen = new Set();
  const push = (row, why) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    hits.push({ ...row, matchReason: why });
  };

  if (candidate.source_id) {
    db.prepare('SELECT * FROM listing WHERE source_id = ? AND source_id != ""')
      .all(candidate.source_id)
      .forEach((r) => push(r, { code: 'same_id' }));
  }

  const target = norm(candidate.address);
  if (target) {
    db.prepare('SELECT * FROM listing').all().forEach((r) => {
      if (norm(r.address) === target) push(r, { code: 'same_address' });
    });
  }

  db.prepare(
    'SELECT * FROM listing WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?'
  )
    .all(candidate.lat - 0.0004, candidate.lat + 0.0004, candidate.lng - 0.0005, candidate.lng + 0.0005)
    .forEach((r) => {
      const d = distanceMetres(candidate.lat, candidate.lng, r.lat, r.lng);
      const sameShape = r.beds === candidate.beds;
      if (d <= 25 && sameShape) push(r, { code: 'same_spot', metres: Math.round(d) });
    });

  return hits.map((h) => ({
    id: h.id,
    address: h.address,
    price: h.price,
    status: h.status,
    first_seen_at: h.first_seen_at,
    matchReason: h.matchReason,
  }));
}

/** Build a scored, unsaved candidate from a Zillow URL. */
export async function candidateFromUrl(url, lang) {
  if (!isZillowUrl(url)) fail('listing.zillow_only', 'That is not a Zillow URL.');
  const { nextData, url: finalUrl } = await fetchZillow(url);
  const listing = normalize(nextData, finalUrl);
  if (!listing) fail('listing.unreadable', 'Could not read that page as a listing. Use a screenshot instead.');
  if (listing.lat == null || listing.lng == null) {
    const g = await geocode(listing.address);
    if (!g) fail('listing.located_but_ungeocodable', 'Read the listing but could not place its address on the map.');
    listing.lat = g.lat;
    listing.lng = g.lng;
  }
  return finishCandidate(listing, { rawJson: nextData, lang });
}

/** Build a scored, unsaved candidate from one or more pasted screenshots. */
export async function candidateFromImages(images, hintUrl, lang) {
  const { fields, needsReview, usage } = await extractFromImages(images);
  if (!fields.address) {
    fail('listing.no_address_in_images',
         'No full address visible in those screenshots. Add one showing it, or type the address.');
  }

  const g = await geocode(fields.address);
  if (!g) fail('listing.geocode_failed', `Could not find that address: ${fields.address}`, { address: fields.address });

  const listing = {
    source: 'screenshot',
    source_id: '',
    url: hintUrl || fields.url || null,
    title: fields.unit ? `${fields.address} ${fields.unit}` : fields.address,
    address: fields.address,
    zip: g.zip || null,
    neighborhood: null,
    lat: g.lat,
    lng: g.lng,
    beds: fields.beds,
    baths: fields.baths,
    sqft: fields.sqft,
    unit_type: fields.beds === 0 ? 'studio' : fields.beds === 1 ? '1b1b' : fields.beds ? `${fields.beds}b` : null,
    price: fields.price,
    monthly_fees: fields.monthly_fees,
    deposit: fields.deposit,
    lease_term: fields.lease_term,
    pets: fields.pets,
    parking: fields.parking,
    laundry: fields.laundry,
    furnished: fields.furnished == null ? null : fields.furnished ? 1 : 0,
    available_from: fields.available_from,
    // Screenshots only ever say "N days ago", so convert to a date the same way the Zillow
    // path does; a stored count would go stale the moment it is written.
    ...(Number.isFinite(fields.listed_days_ago) && fields.listed_days_ago >= 0
      ? { listed_at: new Date(Date.now() - fields.listed_days_ago * 86400e3).toISOString().slice(0, 10),
          listed_basis: 'days' }
      : { listed_at: null, listed_basis: null }),
    walk_score: null,
    transit_score: null,
    bike_score: null,
    // A screenshot has no live page behind it, so the refresh pass must skip it.
    refreshable: hintUrl || fields.url ? 1 : 0,
  };

  return finishCandidate(listing, {
    rawJson: { extracted: fields, usage },
    needsReview,
    sourceSite: fields.source_site,
    lang,
  });
}

/** Build a scored candidate from a bare address, for "what is this corner like". */
export async function candidateFromAddress(address, lang) {
  const g = await geocode(address);
  if (!g) fail('listing.geocode_failed', `Could not find that address: ${address}`, { address });
  return finishCandidate(
    {
      source: 'manual',
      source_id: '',
      url: null,
      title: address,
      address: g.matched || address,
      zip: g.zip || null,
      neighborhood: null,
      lat: g.lat,
      lng: g.lng,
      refreshable: 0,
    },
    { rawJson: { geocode: g }, lang }
  );
}

async function finishCandidate(listing, extra = {}) {
  const scored = await scoreListing(listing);
  const duplicates = findDuplicates(listing);

  let review = null;
  try {
    review = await writeReview(listing, scored.breakdown, extra.lang);
  } catch (err) {
    review = { text: null, code: err.code || null, error: String(err.message || err) };
  }

  return {
    listing,
    score: scored,
    commute: commuteFor(listing.lat, listing.lng),
    review,
    duplicates,
    needsReview: extra.needsReview || [],
    sourceSite: extra.sourceSite || null,
    _rawJson: extra.rawJson || null,
  };
}

const INSERT_COLS = [
  'source', 'source_id', 'url', 'title', 'address', 'city', 'zip', 'neighborhood',
  'lat', 'lng', 'unit_type', 'beds', 'baths', 'sqft', 'price', 'monthly_fees', 'deposit',
  'lease_term', 'pets', 'parking', 'laundry', 'furnished', 'available_from',
  'walk_score', 'transit_score', 'bike_score', 'listed_at', 'listed_basis',
  'status', 'refreshable', 'notes', 'raw_json',
];

/** Commit a candidate. `status` is 'saved' when kept, 'rejected' when dropped. */
export function saveCandidate(candidate, status = 'saved') {
  const l = candidate.listing;
  repriceAfterEdits(candidate);
  const row = {
    ...Object.fromEntries(INSERT_COLS.map((c) => [c, l[c] ?? null])),
    city: l.city || 'San Francisco',
    status,
    refreshable: l.refreshable ?? 1,
    notes: l.notes ?? null,
    raw_json: candidate._rawJson ? JSON.stringify(candidate._rawJson) : null,
  };

  const info = db
    .prepare(
      `INSERT INTO listing (${INSERT_COLS.join(',')})
       VALUES (${INSERT_COLS.map((c) => '@' + c).join(',')})`
    )
    .run(row);
  const id = info.lastInsertRowid;

  const s = candidate.score;
  db.prepare(
    `INSERT INTO score (listing_id, safety, convenience, price_score, overall_stars, breakdown_json, rubric_version, settings_json)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, s.safety, s.convenience, s.price_score, s.overall_stars, JSON.stringify(s.breakdown),
        s.rubric_version, JSON.stringify(s.settings));

  if (candidate.review?.text) {
    db.prepare(
      `INSERT INTO review (listing_id, text, model, prompt_version, lang) VALUES (?,?,?,?,?)`
    ).run(id, candidate.review.text, candidate.review.model, candidate.review.prompt_version,
          candidate.review.lang || null);
  }

  db.prepare(
    `INSERT INTO listing_snapshot (listing_id, price, home_status, still_listed) VALUES (?,?,?,1)`
  ).run(id, l.price ?? null, 'FOR_RENT');

  return getListing(id);
}

/**
 * A screenshot often reads the rent wrong, so the user can correct it in the preview before
 * saving. That correction lands after scoring, which would otherwise store a price line that
 * contradicts the price beside it. Only the price is recomputed: safety and convenience come
 * from the coordinates, which the edits here cannot move.
 */
function repriceAfterEdits(candidate) {
  const b = candidate.score?.breakdown;
  if (!b) return;
  const fresh = priceScore(candidate.listing, settings().budget);
  if (fresh.score === b.price?.score && fresh.total === b.price?.total) return;
  b.price = fresh;
  candidate.score.price_score = fresh.score;
}

export function getListing(id) {
  const row = db
    .prepare(
      `SELECT l.*, s.safety, s.convenience, s.price_score, s.overall_stars, s.breakdown_json,
              s.rubric_version, s.settings_json, r.text AS review_text, r.prompt_version
       FROM listing l
       LEFT JOIN score s ON s.listing_id = l.id
       LEFT JOIN review r ON r.listing_id = l.id
       WHERE l.id = ?`
    )
    .get(id);
  if (!row) return null;
  return hydrate(row);
}

const STATUSES = ['saved', 'rejected', 'deactivated', 'candidate'];

export function listListings({ status = 'saved', includeInactive = true } = {}) {
  // `status` arrives straight from the query string, so it is checked against the known
  // values and bound as a parameter rather than pasted into the SQL.
  if (status !== 'all' && !STATUSES.includes(status)) {
    fail('listing.bad_status', `Unknown status: ${status}`, { status });
  }
  const where =
    status === 'all' ? '1=1' : includeInactive ? `l.status IN (@status, 'deactivated')` : 'l.status = @status';
  return db
    .prepare(
      `SELECT l.*, s.safety, s.convenience, s.price_score, s.overall_stars, s.breakdown_json,
              s.rubric_version, s.settings_json, r.text AS review_text,
              (SELECT COUNT(*) FROM listing_snapshot sn WHERE sn.listing_id = l.id) AS snapshot_count,
              (SELECT price FROM listing_snapshot sn WHERE sn.listing_id = l.id ORDER BY sn.checked_at LIMIT 1) AS first_price
       FROM listing l
       LEFT JOIN score s ON s.listing_id = l.id
       LEFT JOIN review r ON r.listing_id = l.id
       WHERE ${where}
       ORDER BY s.overall_stars DESC NULLS LAST, l.first_seen_at DESC`
    )
    .all(status === 'all' ? {} : { status })
    .map(hydrate);
}

function hydrate(row) {
  const { breakdown_json, settings_json, raw_json, ...rest } = row;
  return {
    ...rest,
    shortlist: !!row.shortlist,
    breakdown: breakdown_json ? JSON.parse(breakdown_json) : null,
    // The weights and budget this score was computed under, so a months-old list can
    // be read without assuming the current settings applied when it was scored.
    scoredWith: settings_json ? JSON.parse(settings_json) : null,
    priceDelta: row.first_price != null && row.price != null ? row.price - row.first_price : null,
    commute: commuteFor(row.lat, row.lng),
  };
}

/** The shortlist is independent of status: starring a listing does not change it. */
export function setShortlist(id, on) {
  db.prepare('UPDATE listing SET shortlist = ? WHERE id = ?').run(on ? 1 : 0, id);
  return getListing(id);
}

/**
 * Re-check saved listings. A listing that has gone away is deactivated with a reason and
 * kept, because "what was available in August at this price" is exactly the benchmark
 * the list is for.
 */
export async function refreshListings(limit = 10) {
  const rows = db
    .prepare(
      `SELECT * FROM listing
       WHERE status = 'saved' AND refreshable = 1 AND url IS NOT NULL
       ORDER BY COALESCE(last_checked_at, '1970-01-01') ASC
       LIMIT ?`
    )
    .all(limit);

  const results = [];
  for (const row of rows) {
    try {
      const { nextData } = await fetchZillow(row.url);
      const live = stillListed(nextData);
      // An unreadable page is a failed check, handled like any other error below.
      if (live.live == null) throw new Error(`Could not read the page (${live.status}).`);
      const fresh = normalize(nextData, row.url);
      const newPrice = fresh?.price ?? null;

      db.prepare(
        `INSERT INTO listing_snapshot (listing_id, price, home_status, still_listed) VALUES (?,?,?,?)`
      ).run(row.id, newPrice, live.status, live.live ? 1 : 0);

      if (!live.live) {
        db.prepare(
          `UPDATE listing SET status='deactivated', deactivated_at=datetime('now'),
           deactivate_reason=?, last_checked_at=datetime('now') WHERE id=?`
        ).run(JSON.stringify({ code: 'no_longer_listed', status: live.status }), row.id);
        results.push({ id: row.id, address: row.address, outcome: 'deactivated', status: live.status });
        continue;
      }

      const changed = newPrice != null && newPrice !== row.price;
      db.prepare(
        `UPDATE listing SET price = COALESCE(?, price), last_checked_at = datetime('now') WHERE id = ?`
      ).run(newPrice, row.id);
      results.push({
        id: row.id,
        address: row.address,
        outcome: changed ? 'price-changed' : 'unchanged',
        from: row.price,
        to: newPrice,
      });
    } catch (err) {
      // A failed check is not evidence the listing is gone. Record it and move on.
      db.prepare(`UPDATE listing SET last_checked_at = datetime('now') WHERE id = ?`).run(row.id);
      results.push({ id: row.id, address: row.address, outcome: 'error', error: String(err.message || err) });
    }
  }

  const remaining = db
    .prepare(
      `SELECT COUNT(*) n FROM listing WHERE status='saved' AND refreshable=1 AND url IS NOT NULL
       AND (last_checked_at IS NULL OR last_checked_at < datetime('now','-1 hour'))`
    )
    .get().n;

  return { checked: results.length, results, remaining };
}

export function setStatus(id, status, reason) {
  if (!STATUSES.includes(status)) fail('listing.bad_status', `Unknown status: ${status}`, { status });
  db.prepare(
    `UPDATE listing SET status = ?,
       deactivated_at = CASE WHEN ? = 'deactivated' THEN datetime('now') ELSE deactivated_at END,
       deactivate_reason = COALESCE(?, deactivate_reason)
     WHERE id = ?`
  ).run(status, status, reason ?? null, id);
  return getListing(id);
}

/** Recompute every stored score against the current rubric, so the list stays comparable. */
export async function rescoreAll() {
  const rows = db.prepare(`SELECT * FROM listing`).all();
  let n = 0;
  for (const row of rows) {
    const scored = await scoreListing(row);
    db.prepare(
      `INSERT INTO score (listing_id, safety, convenience, price_score, overall_stars, breakdown_json, rubric_version, settings_json, computed_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(listing_id) DO UPDATE SET
         safety=excluded.safety, convenience=excluded.convenience, price_score=excluded.price_score,
         overall_stars=excluded.overall_stars, breakdown_json=excluded.breakdown_json,
         rubric_version=excluded.rubric_version, settings_json=excluded.settings_json,
         computed_at=excluded.computed_at`
    ).run(row.id, scored.safety, scored.convenience, scored.price_score, scored.overall_stars,
          JSON.stringify(scored.breakdown), scored.rubric_version, JSON.stringify(scored.settings));
    n += 1;
  }
  return { rescored: n };
}

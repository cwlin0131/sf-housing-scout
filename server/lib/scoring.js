import { db, cacheGet, cacheSet } from './db.js';
import { distanceMetres, bboxDeltas, walkMinutes, amenitiesNear, nearestTransit, anchors } from './geo.js';
import { zoneAt, placeAt } from './zones.js';
import { RUBRIC_VERSION, SAFETY, CONVENIENCE } from './config.js';
import { settings, scoringSnapshot } from './settings.js';

/**
 * Two measured scores, safety and convenience, plus price as information.
 *
 * There is deliberately no headline number. Safety and convenience pull against each
 * other here, since the quiet places are far out and the well-connected ones are busy, and
 * choosing between them is the decision, not something to average away. Price is the
 * user's own judgement and never enters a score at all. Everything returns its own
 * breakdown, and the written review is generated from the same figures.
 */

// ---------------------------------------------------------------- safety

const nightWeight = (hour) => {
  if (hour == null) return 1;
  const { fromHour, toHour, multiplier } = SAFETY.night;
  const isNight = hour >= fromHour || hour < toHour;
  return isNight ? multiplier : 1;
};

/**
 * The date the windows below count back from: the newest incident on disk, not today.
 *
 * Counting back from today meant the data aged out from under the score between syncs.
 * Two months after a sync the twelve-month window held only ten months of incidents, so
 * every address read safer than it had, by an amount that depended on nothing but how
 * long ago `npm run sync` was run. Anchoring on the data keeps a score stable until new
 * data arrives, and the status line already says how old that data is.
 */
function dataEnd() {
  return db.prepare('SELECT MAX(occurred) d FROM incident').get().d;
}

/**
 * Distance-decayed, night-weighted incident load around a point. An incident 50 m away
 * shapes the walk home far more than one 380 m away, so raw counts inside a radius are
 * the wrong unit.
 */
function weightedLoad(lat, lng, kind, radius, months, end) {
  const { dLat, dLng } = bboxDeltas(lat, radius);
  const rows = db
    .prepare(
      `SELECT lat, lng, hour, category FROM incident
       WHERE kind = ? AND occurred >= date(?, ?)
         AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
    )
    .all(kind, end, `-${months} months`, lat - dLat, lat + dLat, lng - dLng, lng + dLng);

  let load = 0;
  let count = 0;
  const byCategory = {};
  for (const r of rows) {
    const d = distanceMetres(lat, lng, r.lat, r.lng);
    if (d > radius) continue;
    count += 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    load += Math.exp(-d / SAFETY.decayMetres) * nightWeight(r.hour);
  }
  return { load, count, byCategory };
}

/**
 * Convert a raw load into "safer than X% of San Francisco".
 *
 * Absolute counts are meaningless to someone deciding where to live; the decision-relevant
 * frame is how this block compares to the rest of the city. The distribution is built once
 * per sync over a citywide grid and cached.
 */
function toPercentile(load, kind) {
  const dist = cacheGet(`distribution:${kind}`, 90);
  if (!dist?.values?.length) return null;
  const { values, cum, total } = dist;
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < load) lo = mid + 1;
    else hi = mid;
  }
  // Grid cells are weighted by how many addresses they contain, so this reads as
  // "quieter than X% of San Francisco homes" rather than "of San Francisco acres".
  const below = lo === 0 ? 0 : cum[lo - 1];
  return below / total; // 0 = quietest, 1 = worst
}

/**
 * Map a weighted incident load onto the 0-100 scale by interpolating SAFETY.scale.
 *
 * Interpolation is linear in log10(load): load runs from about 3 to about 340 across the
 * city, so a linear reading would put everything except the very worst blocks at the top.
 */
export function loadToScore(load) {
  const pts = SAFETY.scale;
  const lg = (v) => Math.log10(Math.max(v, 0.1));
  if (load >= pts[0].load) return pts[0].score;
  for (let i = 0; i < pts.length - 1; i++) {
    const hi = pts[i];
    const lo = pts[i + 1];
    if (load <= hi.load && load >= lo.load) {
      const span = lg(hi.load) - lg(lo.load);
      const t = span <= 0 ? 0 : (lg(hi.load) - lg(load)) / span;
      return hi.score + t * (lo.score - hi.score);
    }
  }
  return pts[pts.length - 1].score;
}

export function safetyScore(lat, lng, neighborhood) {
  const end = dataEnd();
  const zone = zoneAt(lat, lng);

  const place = placeAt(lat, lng);

  if (!end) {
    // Before the first sync, fall back to the curated area read so the tool is still
    // usable on day one. Marked clearly so nobody mistakes it for measured data.
    // An area the user ruled out still caps it: that judgement does not wait for a sync.
    const { score, capped } = applyAvoid(zone ? (zone.tier - 1) * 25 : 50, [neighborhood, zone?.name, place]);
    return {
      score,
      basis: 'zone-only',
      place,
      zone: zone ? { name: zone.name, tier: zone.tier, summary: zone.summary } : null,
      capped,
      note: { code: 'no_crime_data' },
      parts: {},
    };
  }

  const personal = weightedLoad(lat, lng, 'personal', SAFETY.radius.personal, SAFETY.months.personal, end);
  const property = weightedLoad(lat, lng, 'property', SAFETY.radius.property, SAFETY.months.property, end);
  const street = weightedLoad(lat, lng, 'street', SAFETY.radius.street, SAFETY.months.street, end);

  const pPersonal = toPercentile(personal.load, 'personal') ?? 0.5;
  const pProperty = toPercentile(property.load, 'property') ?? 0.5;
  const pStreet = toPercentile(street.load, 'street') ?? 0.5;

  const trend = trendAdjustment(lat, lng, end);

  const w = SAFETY.weights;
  const wSum = w.personal + w.property + w.street;
  const composite = (w.personal * personal.load + w.property * property.load + w.street * street.load) / wSum;

  // Scored against the fixed curve in SAFETY.scale, not against the other addresses in the
  // city. See the note there for why the ranking it replaced read every dense block as
  // dangerous. The citywide percentile is still computed, but only to show as context.
  let score = Math.round(loadToScore(composite) - trend.penalty);
  score = Math.max(0, Math.min(100, score));

  const avoided = applyAvoid(score, [neighborhood, zone?.name, place]);
  score = avoided.score;
  const { capped } = avoided;

  return {
    score,
    basis: 'incidents',
    place,
    zone: zone ? { name: zone.name, tier: zone.tier, summary: zone.summary } : null,
    capped,
    parts: {
      personal: { ...personal, percentile: round2(pPersonal), radius: SAFETY.radius.personal },
      property: { ...property, percentile: round2(pProperty), radius: SAFETY.radius.property },
      street: { ...street, percentile: round2(pStreet), radius: SAFETY.radius.street },
      trend,
    },
  };
}

/**
 * Lived experience beats a statistic. Areas the user has walked and ruled out get capped.
 * Matched against the common name too, not just the coarse zone: someone who rules out
 * Dogpatch is naming a place that no zone is called.
 *
 * Whole names only. A substring match meant ruling out "Mission" also capped Mission Bay
 * and Mission Dolores, which are different places with different reads.
 */
function applyAvoid(score, candidates) {
  const names = candidates.filter(Boolean).map((n) => n.trim().toLowerCase());
  const flag = (settings().avoid || []).find((f) => names.includes(f.name.trim().toLowerCase()));
  if (!flag || score <= flag.cap) return { score, capped: null };
  return { score: flag.cap, capped: { name: flag.name, from: score, to: flag.cap } };
}

/** Is this block getting better or worse? Last 3 months against the same window a year back. */
function trendAdjustment(lat, lng, end) {
  const { dLat, dLng } = bboxDeltas(lat, SAFETY.radius.personal);
  const q = (fromMod, toMod) =>
    db
      .prepare(
        `SELECT COUNT(*) n FROM incident
         WHERE kind = 'personal' AND occurred >= date(?, ?) AND occurred < date(?, ?)
           AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      )
      .get(end, fromMod, end, toMod, lat - dLat, lat + dLat, lng - dLng, lng + dLng).n;

  // '+1 day' so the window includes `end` itself; the comparison is strictly-less-than.
  //
  // The baseline is the preceding three months, not the same three months a year ago. The
  // year-ago window looked better on paper but sat almost entirely outside the data: the
  // sync keeps thirteen months and prunes past that, so `prior` came back 0 for every
  // address in the city, `change` took the divide-by-zero branch, and every single listing
  // was labelled "worsening +100%" and docked the full five points. That measured where
  // the dataset ends, not whether a block is getting worse. Consecutive quarters carry
  // some seasonal noise, which the five-point cap keeps in proportion.
  const now = q('-3 months', '+1 day');
  const prior = q('-6 months', '-3 months');

  // If the data cannot cover the baseline window, say nothing rather than guess.
  const earliest = db.prepare(`SELECT MIN(occurred) d FROM incident WHERE kind = 'personal'`).get().d;
  const covered = earliest && earliest <= db.prepare(`SELECT date(?, '-6 months') d`).get(end).d;
  if (!covered) return { now, prior, direction: 'unknown', changePct: null, penalty: 0 };

  // A percentage change on a handful of incidents is noise: a quiet block going from 4 to
  // 0 is not "improving 100%", it is the same quiet block. Below this volume, say flat.
  if (Math.max(now, prior) < 8) return { now, prior, direction: 'flat', changePct: 0, penalty: 0 };

  const change = prior === 0 ? 1 : (now - prior) / prior;
  // Capped at five points either way: a trend is a hint, not the headline.
  const penalty = Math.max(-5, Math.min(5, Math.round(change * 10))) || 0; // `|| 0` drops -0
  return {
    now,
    prior,
    direction: change > 0.15 ? 'worsening' : change < -0.15 ? 'improving' : 'flat',
    changePct: Math.round(change * 100),
    penalty,
  };
}

// ---------------------------------------------------------------- convenience

export async function convenienceScore(lat, lng, listing = {}) {
  const list = anchors().filter((a) => a.scored);
  const anchorDetail = list.map((a) => {
    const metres = Math.round(distanceMetres(lat, lng, a.lat, a.lng));
    return { name: a.name, note: a.note, weight: a.weight, metres, minutes: +walkMinutes(metres).toFixed(0) };
  });

  // A 15 minute walk is comfortable, 45 is a different life. Score each anchor on that
  // span and combine by the weights the user set.
  const anchorScore = (() => {
    if (!anchorDetail.length) return null;
    const totalW = anchorDetail.reduce((s, a) => s + a.weight, 0);
    const sum = anchorDetail.reduce((s, a) => {
      const m = a.minutes;
      const v = m <= 15 ? 100 : m >= 45 ? 10 : 100 - ((m - 15) / 30) * 90;
      return s + v * a.weight;
    }, 0);
    return sum / totalW;
  })();

  const transit = nearestTransit(lat, lng);
  const transitScore = (() => {
    const best = [transit.bart, transit.muni_metro].filter(Boolean).sort((a, b) => a.metres - b.metres)[0];
    if (!best) return null;
    const { greatMetres, okMetres } = CONVENIENCE.transit;
    const base =
      best.metres <= greatMetres ? 100
      : best.metres >= okMetres * 2 ? 15
      : 100 - ((best.metres - greatMetres) / (okMetres * 2 - greatMetres)) * 85;
    // More distinct lines within walking distance means real optionality, not just proximity.
    return Math.min(100, base + Math.min(15, transit.linesWithin800 * 4));
  })();

  const amen = await amenitiesNear(lat, lng, CONVENIENCE.amenityRadius);
  const amenityScore = (() => {
    if (!amen.ok) return null;
    const targets = CONVENIENCE.amenityTargets;
    const keys = Object.keys(targets);
    const sum = keys.reduce((s, k) => s + Math.min(1, (amen.counts[k] || 0) / targets[k]), 0);
    return (sum / keys.length) * 100;
  })();

  const ws = listing.walk_score;
  const ts = listing.transit_score;
  const walkscoreScore = ws != null || ts != null ? (ws ?? ts) : null;

  const terrain = await terrainPenalty(lat, lng, transit);

  // Any component we could not measure drops out and its weight is shared by the rest,
  // rather than silently scoring zero and dragging the total down.
  const components = [
    ['anchors', anchorScore, CONVENIENCE.weights.anchors],
    ['transit', transitScore, CONVENIENCE.weights.transit],
    ['amenities', amenityScore, CONVENIENCE.weights.amenities],
    ['walkscore', walkscoreScore, CONVENIENCE.weights.walkscore],
    ['terrain', terrain.score, CONVENIENCE.weights.terrain],
  ].filter(([, v]) => v != null);

  const totalW = components.reduce((s, [, , w]) => s + w, 0) || 1;
  const score = Math.round(components.reduce((s, [, v, w]) => s + v * w, 0) / totalW);

  return {
    score: Math.max(0, Math.min(100, score)),
    parts: {
      anchors: { score: anchorScore == null ? null : Math.round(anchorScore), detail: anchorDetail },
      transit: { score: transitScore == null ? null : Math.round(transitScore), ...transit },
      amenities: { score: amenityScore == null ? null : Math.round(amenityScore), counts: amen.counts, nearest: amen.nearest, ok: amen.ok },
      walkscore: walkscoreScore,
      terrain,
    },
    missing: ['anchors', 'transit', 'amenities', 'walkscore', 'terrain'].filter(
      (k) => !components.some(([n]) => n === k)
    ),
  };
}

/**
 * How much hill sits between the door and the nearest rail stop. In San Francisco this is
 * the difference between walking to the train and deciding not to bother.
 */
async function terrainPenalty(lat, lng, transit) {
  const best = [transit.bart, transit.muni_metro].filter(Boolean).sort((a, b) => a.metres - b.metres)[0];
  if (!best) return { score: null, note: { code: 'no_stop_nearby' } };

  const stop = { lat: best.lat, lng: best.lng };

  const key = `elev:${lat.toFixed(4)},${lng.toFixed(4)}|${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`;
  let elev = cacheGet(key, 3650);
  if (!elev) {
    try {
      const url = `https://api.opentopodata.org/v1/aster30m?locations=${lat},${lng}|${stop.lat},${stop.lng}`;
      const j = await (await fetch(url, { signal: AbortSignal.timeout(12000) })).json();
      if (j?.results?.length === 2) {
        elev = { home: j.results[0].elevation, stop: j.results[1].elevation };
        cacheSet(key, elev);
      }
    } catch { /* elevation is a nicety; never block a score on it */ }
  }
  if (!elev) return { score: null, note: { code: 'no_elevation' } };

  const climb = Math.max(0, elev.home - elev.stop);
  // 30 m of climb over a few blocks is a real hill; past 60 m it is a decision every time.
  const score = climb <= 8 ? 100 : climb >= 60 ? 20 : 100 - ((climb - 8) / 52) * 80;
  return {
    score: Math.round(score),
    climbMetres: Math.round(climb),
    homeElevation: Math.round(elev.home),
    stopElevation: Math.round(elev.stop),
    note: { code: climb <= 8 ? 'flat' : climb >= 40 ? 'steep' : 'some_climb' },
  };
}

// ---------------------------------------------------------------- price

/**
 * Price is reported, never rated.
 *
 * What a given rent is worth against a given block is the user's call, so the budget
 * is a reference line rather than a scoring input: over it is marked, not penalised.
 * The 0-100 figure is only there to make the list sortable by value for money.
 */
export function priceScore(listing, budget) {
  const total = (listing.price || 0) + (listing.monthly_fees || 0);
  if (!total) return { score: null, note: { code: 'no_price' } };

  const { max, ideal } = budget;
  const perSqft = listing.sqft ? +(total / listing.sqft).toFixed(2) : null;
  const over = total > max;

  // The scale runs past the reference line rather than stopping at it: zero sits an
  // equal distance above `max` as `ideal` sits below, so two over-budget listings
  // still order against each other instead of both flattening to nothing. The line
  // itself lands near the middle, which is the point. It marks, it does not disqualify.
  const span = Math.max(1, max - ideal);
  const zeroAt = max + span;
  const frac = Math.max(0, Math.min(1, (zeroAt - total) / (zeroAt - ideal)));
  const score = Math.round(100 * Math.pow(frac, 1.25));

  return {
    score: Math.max(0, Math.min(100, score)),
    total,
    overBudget: over,
    perSqft,
    headroom: max - total,
    note: over
      ? { code: 'over_by', amount: total - max }
      : total <= ideal ? { code: 'below_sweet' } : { code: 'under_by', amount: max - total },
  };
}

// ---------------------------------------------------------------- optional composite

/**
 * A single sortable number, off unless the user turns it on.
 *
 * Safety and convenience run in opposite directions across this city (measured at
 * r = -0.32 across a sample of blocks): the safe places are far out and the
 * convenient ones are busy. Averaging them squeezes an 85-point safety spread into
 * roughly 45 points and can put a Tenderloin-adjacent block above a quiet one, which
 * is worse than no number at all. Kept as an opt-in because a rough sort key is
 * occasionally still useful.
 */
export function compositeScore(safety, convenience, weights) {
  const parts = [[safety, weights.safety], [convenience, weights.convenience]].filter(([v]) => v != null);
  if (!parts.length) return { stars: null, composite: null };
  const totalW = parts.reduce((s, [, w]) => s + w, 0) || 1;
  const composite = parts.reduce((s, [v, w]) => s + v * w, 0) / totalW;
  return { stars: Math.max(0.5, Math.round((composite / 100) * 10) / 2), composite: Math.round(composite) };
}

export async function scoreListing(listing) {
  const cfg = settings();
  const safety = safetyScore(listing.lat, listing.lng, listing.neighborhood);
  const convenience = await convenienceScore(listing.lat, listing.lng, listing);
  const price = priceScore(listing, cfg.budget);

  const { stars, composite } = cfg.composite.enabled
    ? compositeScore(safety.score, convenience.score, cfg.composite)
    : { stars: null, composite: null };

  return {
    safety: safety.score,
    convenience: convenience.score,
    price_score: price.score,
    overall_stars: stars,
    composite,
    rubric_version: RUBRIC_VERSION,
    settings: scoringSnapshot(),
    breakdown: { safety, convenience, price },
  };
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

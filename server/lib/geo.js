import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, cacheGet, cacheSet } from './db.js';
import { DATA, LIFESTYLE } from './config.js';
import { DATA_DIR } from './paths.js';

const R = 6371000; // earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export function distanceMetres(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const walkMinutes = (metres) => metres / LIFESTYLE.walkMetresPerMinute;

/** Degree deltas covering `metres` at this latitude, for cheap SQL pre-filtering. */
export function bboxDeltas(lat, metres) {
  return {
    dLat: metres / 111_320,
    dLng: metres / (111_320 * Math.cos(rad(lat)) || 1),
  };
}

/**
 * Turn a street address into coordinates using the city's own address file, which is
 * mirrored locally after first use. Falls back to Nominatim only when SF has no record,
 * because Nominatim caps at one request per second and forbids systematic querying.
 */
export async function geocode(rawAddress) {
  const address = rawAddress.trim().replace(/\s+/g, ' ');
  const key = `geocode:${address.toLowerCase()}`;
  const hit = cacheGet(key, 365);
  if (hit) return hit;

  const parsed = parseStreetAddress(address);
  if (parsed) {
    const url =
      `${DATA.sfAddresses}?address_number=${encodeURIComponent(parsed.number)}` +
      `&street_name=${encodeURIComponent(parsed.street.toUpperCase())}` +
      `&$select=address,longitude,latitude,zip_code&$limit=1`;
    try {
      const rows = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
      if (Array.isArray(rows) && rows.length && rows[0].latitude) {
        const out = {
          lat: +rows[0].latitude,
          lng: +rows[0].longitude,
          zip: rows[0].zip_code,
          matched: rows[0].address,
          via: 'datasf',
        };
        cacheSet(key, out);
        return out;
      }
    } catch { /* fall through to Nominatim */ }
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=` +
      encodeURIComponent(/san francisco/i.test(address) ? address : `${address}, San Francisco, CA`);
    const rows = await (
      await fetch(url, {
        headers: { 'User-Agent': 'sf-housing-scout/0.1 (personal apartment search; local use)' },
        signal: AbortSignal.timeout(15000),
      })
    ).json();
    if (Array.isArray(rows) && rows.length) {
      const out = { lat: +rows[0].lat, lng: +rows[0].lon, matched: rows[0].display_name, via: 'nominatim' };
      cacheSet(key, out);
      return out;
    }
  } catch { /* give up below */ }

  return null;
}

function parseStreetAddress(address) {
  // "1160 Battery St, San Francisco, CA 94111" -> { number: 1160, street: "BATTERY" }
  const head = address.split(',')[0].trim();
  const m = head.match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  const street = m[2]
    .replace(/\b(apt|unit|ste|suite|#)\s*\S+$/i, '')
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|place|pl|court|ct|terrace|ter|plaza)\.?$/i, '')
    .trim();
  return street ? { number: m[1], street } : null;
}

const OVERPASS_GROUPS = {
  supermarket: '["shop"~"^(supermarket|grocery|convenience)$"]',
  cafe: '["amenity"="cafe"]',
  restaurant: '["amenity"="restaurant"]',
  gym: '["leisure"="fitness_centre"]',
  pharmacy: '["amenity"="pharmacy"]',
  laundry: '["shop"~"^(laundry|dry_cleaning)$"]',
};

/**
 * Count everyday amenities around a point, plus the nearest supermarket and restaurant so
 * the written review can say "there is a grocery five minutes away" rather than a bare count.
 */
export async function amenitiesNear(lat, lng, radius) {
  const key = `amenities:${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}`;
  const hit = cacheGet(key, 120);
  if (hit) return hit;

  const body =
    `[out:json][timeout:25];(` +
    Object.values(OVERPASS_GROUPS)
      .map((f) => `nwr${f}(around:${radius},${lat},${lng});`)
      .join('') +
    `);out center tags;`;

  let elements = [];
  let reached = false;
  try {
    // Overpass answers 406 to a request without a User-Agent, and expects the query as a
    // `data` form field rather than a raw body. It also rate-limits, so calls are spaced.
    await overpassTurn();
    const res = await fetch(DATA.overpass, {
      method: 'POST',
      body: new URLSearchParams({ data: body }),
      headers: { 'User-Agent': 'sf-housing-scout/0.1 (personal apartment search; local use)' },
      signal: AbortSignal.timeout(45000),
    });
    reached = res.ok;
    if (res.ok) elements = (await res.json()).elements || [];
  } catch { /* leave empty; the score degrades honestly rather than guessing */ }

  const out = { counts: {}, nearest: {}, radius, ok: reached };
  for (const name of Object.keys(OVERPASS_GROUPS)) {
    out.counts[name] = 0;
    out.nearest[name] = null;
  }

  for (const el of elements) {
    const t = el.tags || {};
    const group =
      t.shop && /^(supermarket|grocery|convenience)$/.test(t.shop) ? 'supermarket'
      : t.amenity === 'cafe' ? 'cafe'
      : t.amenity === 'restaurant' ? 'restaurant'
      : t.leisure === 'fitness_centre' ? 'gym'
      : t.amenity === 'pharmacy' ? 'pharmacy'
      : t.shop && /^(laundry|dry_cleaning)$/.test(t.shop) ? 'laundry'
      : null;
    if (!group) continue;
    out.counts[group] += 1;
    const p = el.center || el;
    if (p.lat == null) continue;
    const d = Math.round(distanceMetres(lat, lng, p.lat, p.lon));
    if (!out.nearest[group] || d < out.nearest[group].metres) {
      out.nearest[group] = { metres: d, name: t.name || null };
    }
  }

  // Only a real answer is worth keeping. A rate-limited or timed-out call used to be
  // cached exactly like an empty neighbourhood and held for 120 days, which silently
  // dropped a fifth of the convenience rubric and never recovered on its own.
  if (reached) cacheSet(key, out);
  return out;
}

// Overpass is a shared free service and starts refusing a rapid series of queries. One at
// a time with a gap: scoring a listing is not latency-critical, and a refused call costs
// more than the wait.
const OVERPASS_GAP_MS = 1200;
let overpassChain = Promise.resolve();
let lastOverpassAt = 0;
function overpassTurn() {
  overpassChain = overpassChain.then(async () => {
    const wait = lastOverpassAt + OVERPASS_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastOverpassAt = Date.now();
  });
  return overpassChain;
}

/**
 * Distance to the nearest BART station and Muni Metro stop, read from the local transit
 * files. Loaded once and kept in memory: it is a few hundred points.
 */
let stopsCache = null;
export function loadStops() {
  if (stopsCache) return stopsCache;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'transit-stops.geojson'), 'utf8'));
    stopsCache = raw.features.map((f) => ({
      mode: f.properties.mode,
      name: f.properties.name,
      lines: f.properties.lines || [],
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  } catch {
    stopsCache = [];
  }
  return stopsCache;
}

export function nearestTransit(lat, lng) {
  const stops = loadStops();
  const best = { bart: null, muni_metro: null };
  for (const s of stops) {
    const d = Math.round(distanceMetres(lat, lng, s.lat, s.lng));
    const slot = s.mode === 'bart' ? 'bart' : 'muni_metro';
    if (!best[slot] || d < best[slot].metres) {
      best[slot] = { metres: d, name: s.name, lines: s.lines, minutes: +walkMinutes(d).toFixed(1), lat: s.lat, lng: s.lng };
    }
  }
  // How many distinct rail lines are reachable on foot, as a proxy for real optionality.
  const linesWithin = new Set();
  for (const s of stops) {
    if (distanceMetres(lat, lng, s.lat, s.lng) <= 800) {
      (s.lines.length ? s.lines : [s.mode]).forEach((l) => linesWithin.add(`${s.mode}:${l}`));
    }
  }
  return { ...best, linesWithin800: linesWithin.size };
}

export function anchors() {
  return db.prepare('SELECT * FROM anchor ORDER BY weight DESC, id').all();
}

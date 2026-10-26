import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from './paths.js';

/**
 * Curated area overlay: a coarse, sourced read of how each part of the city feels, used
 * for the map's heat layer and as context on every card.
 *
 * This is deliberately not a statistical surface. Per-listing safety comes from incident
 * data in a radius; this layer answers the different question of "what is this area known
 * for", which is what a person actually asks first.
 */

const PATH = resolve(DATA_DIR, 'safety-zones.json');

let cache = null;
export function loadZones() {
  if (cache) return cache;
  if (!existsSync(PATH)) {
    cache = { version: null, zones: [], places: [], sources: [] };
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(PATH, 'utf8'));
    // Precompute bounding boxes so the common case (point far from a zone) costs four
    // comparisons instead of walking every vertex.
    raw.zones = (raw.zones || []).map((z) => {
      const lats = z.polygon.map((p) => p[0]);
      const lngs = z.polygon.map((p) => p[1]);
      return {
        ...z,
        bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
      };
    });
    raw.places = (raw.places || []).map((p) => {
      const lats = p.polygon.map((q) => q[0]);
      const lngs = p.polygon.map((q) => q[1]);
      return {
        ...p,
        bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
        area: ringArea(p.polygon),
      };
    });
    cache = raw;
  } catch (err) {
    cache = { version: null, zones: [], places: [], sources: [], error: String(err) };
  }
  return cache;
}

/** Shoelace area in degrees squared. Only ever compared against another, so units do not matter. */
function ringArea(poly) {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += poly[j][1] * poly[i][0] - poly[i][1] * poly[j][0];
  }
  return Math.abs(sum / 2);
}

function inPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The zone containing this point. When zones overlap, the more cautious tier wins. */
export function zoneAt(lat, lng) {
  const { zones } = loadZones();
  let best = null;
  for (const z of zones) {
    const [minLat, minLng, maxLat, maxLng] = z.bbox;
    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
    if (!inPolygon(lat, lng, z.polygon)) continue;
    if (!best || z.tier < best.tier) best = z;
  }
  return best;
}

/**
 * The name a person would actually use for this spot, from the city's 117-name set.
 *
 * Separate from `zoneAt` on purpose: that returns the coarse area the written read belongs
 * to, and the two disagree by design. A point in Dogpatch is in the Potrero Hill zone.
 */
export function placeAt(lat, lng) {
  const { places } = loadZones();
  // These polygons overlap, and the smaller one is always the more specific name: Dogpatch
  // sits inside Central Waterfront, Cow Hollow inside the Marina. Taking the first match
  // would just return whichever happened to be earlier in the file.
  let best = null;
  for (const p of places) {
    const [minLat, minLng, maxLat, maxLng] = p.bbox;
    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
    if (!inPolygon(lat, lng, p.polygon)) continue;
    if (!best || p.area < best.area) best = p;
  }
  return best?.name ?? null;
}

export function allZones() {
  const { zones, places, sources, version, generated } = loadZones();
  return {
    version,
    generated,
    sources,
    zones: zones.map(({ bbox, ...z }) => z),
    places: places.map(({ bbox, ...p }) => p),
  };
}

export function reload() {
  cache = null;
  return loadZones();
}

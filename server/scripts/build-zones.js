#!/usr/bin/env node
/**
 * Builds the curated area overlay: official neighbourhood boundaries from the city, paired
 * with a hand-assigned tier and a short written read grounded in 2025-2026 reporting.
 *
 * Run: node server/scripts/build-zones.js
 *
 * The tiers are judgement, not arithmetic. That is deliberate. A statistical surface over
 * incident counts is already what the per-listing score does; this layer answers the
 * different question a person actually asks first, which is "what is this part of town
 * like to live in". Every tier traces to a source; the content itself lives in
 * server/data/area-reads.js so a wording fix does not mean touching this script.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOURCES, AREAS } from '../data/area-reads.js';

const BOUNDARIES = 'https://data.sf.gov/resource/ajp5-b2md.geojson';
// The city publishes two neighbourhood sets. The 41 "Analysis Neighborhoods" above are an
// administrative carve-up and are what the tiers are written against. These 117 are the
// names people actually use, and they are the ones a renter searches for: Dogpatch and
// Rincon Hill exist here but are swallowed by Potrero Hill and Financial District above.
// They carry no tier, only a label.
const PLACES = 'https://data.sf.gov/resource/gfpk-269f.geojson';
const OUT = resolve(process.cwd(), 'data/safety-zones.json');



/**
 * Split lines: where the evidence says the two sides of one official neighbourhood read
 * differently, the boundary is cut along the street the reporting points at. Each line is
 * two [lat, lng] points extended well past the polygon; `part` on an AREAS entry picks a
 * side. Sign convention: +1 keeps the west/left side of the line, -1 the east/right.
 */
const SPLITS = {
  'South of Market': { line: [[37.792, -122.413], [37.768, -122.384]], west: 1, east: -1 }, // 4th St
  'Mission': { line: [[37.775, -122.4205], [37.742, -122.4175]], west: 1, east: -1 }, // Mission St
};

/** Sutherland–Hodgman clip of a ring against the half-plane on `sign` side of line a→b. */
function clipHalf(poly, [a, b], sign) {
  const side = (p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * sign;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const cur = poly[i];
    const ps = side(prev);
    const cs = side(cur);
    if (ps >= 0 !== cs >= 0) {
      const t = ps / (ps - cs);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cs >= 0) out.push(cur);
  }
  return out;
}

/** Reduce a ring to at most `max` points so the whole file stays small enough to ship. */
function simplify(ring, max = 40) {
  if (ring.length <= max) return ring;
  const step = ring.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(ring[Math.floor(i * step)]);
  out.push(ring[ring.length - 1]);
  return out;
}

/** Largest ring of a Polygon or MultiPolygon, converted from [lng,lat] to [lat,lng]. */
function biggestRing(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  for (const poly of polys) {
    const ring = poly[0];
    if (!best || ring.length > best.length) best = ring;
  }
  return simplify(best.map(([lng, lat]) => [lat, lng]));
}

/** Fine-grained names only: no tier, no summary, just "what do people call this spot". */
async function fetchPlaces() {
  const res = await fetch(PLACES, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`could not fetch common names: ${res.status}`);
  const geo = await res.json();
  return geo.features
    .map((f) => ({ name: f.properties.name, polygon: biggestRing(f.geometry) }))
    .filter((p) => p.name && p.polygon?.length)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const main = async () => {
  console.log('fetching official neighbourhood boundaries...');
  const res = await fetch(BOUNDARIES, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`could not fetch boundaries: ${res.status}`);
  const geo = await res.json();
  console.log(`  ${geo.features.length} neighbourhoods`);

  const byName = new Map();
  for (const f of geo.features) {
    const name = f.properties.nhood || f.properties.name;
    if (name) byName.set(name.toLowerCase(), f);
  }

  const byId = new Map(SOURCES.map((x) => [x.id, x]));
  const seen = new Set();
  const zones = [];
  const missing = [];
  const dangling = [];

  for (const t of AREAS) {
    const key = t.nhood + (t.part ? `#${t.part}` : '');
    if (!t.summary?.en || seen.has(key)) continue;
    seen.add(key);
    seen.add(t.nhood); // the official name is judged either way; keeps the unjudged list honest
    // A claim with no evidence behind it is worse than no claim, so a bad reference
    // fails the build rather than silently dropping the citation.
    for (const id of t.sources || []) if (!byId.has(id)) dangling.push(`${t.nhood} -> ${id}`);
    const f = byName.get(t.nhood.toLowerCase());
    if (!f) { missing.push(t.nhood); continue; }
    let polygon = biggestRing(f.geometry);
    if (t.part) {
      const sp = SPLITS[t.nhood];
      if (!sp || !sp[t.part]) { missing.push(`${t.nhood} (${t.part}: no split line)`); continue; }
      polygon = clipHalf(polygon, sp.line, sp[t.part]);
      if (polygon.length < 3) { missing.push(`${t.nhood} (${t.part}: empty after clip)`); continue; }
    }
    zones.push({
      id: t.id || t.nhood.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: t.name || t.nhood,
      tier: t.tier,
      summary: t.summary,
      signals: t.signals,
      sources: t.sources,
      polygon,
    });
  }

  if (dangling.length) {
    throw new Error('sources referencing an id that does not exist: ' + dangling.join(', '));
  }

  // Anything the city defines but we have not judged is better left uncoloured than
  // guessed at, so it simply does not appear on the overlay.
  const unjudged = [...byName.keys()].filter((k) => !seen.has([...seen].find((s) => s.toLowerCase() === k) || ''))
    .filter((k) => ![...seen].some((s) => s.toLowerCase() === k));

  console.log('fetching the common neighbourhood names...');
  const places = await fetchPlaces();
  console.log(`  ${places.length} names`);

  const out = {
    version: '1.2',
    generated: new Date().toISOString().slice(0, 10),
    note: {
      en: 'Tiers are a hand-assigned judgement, evidenced by the sources listed on each zone. A listing’s own safety score is computed from incident data in a radius around it, which is a different thing from this layer.',
      zh: 'tier 是人工判定，依據列在每一區的 sources。個別物件的治安分數走的是事件資料的半徑計算，跟這一層是兩回事。',
    },
    sources: SOURCES,
    zones,
    places,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1));

  const dist = zones.reduce((a, z) => ({ ...a, [z.tier]: (a[z.tier] || 0) + 1 }), {});
  console.log(`wrote ${OUT}`);
  console.log(`  ${zones.length} zones, tier spread ${JSON.stringify(dist)}`);
  console.log(`  ${places.length} common names`);
  console.log(`  ${Math.round(zones.reduce((s, z) => s + z.polygon.length, 0) / zones.length)} vertices per ring on average`);
  if (missing.length) console.log(`  no official boundary matched: ${missing.join(', ')}`);
  if (unjudged.length) console.log(`  not judged, so left uncoloured: ${unjudged.join(', ')}`);
};

main().catch((e) => { console.error('failed:', e.message); process.exit(1); });

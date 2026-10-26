#!/usr/bin/env node
/**
 * Pulls the city's incident data into the local database and precomputes the citywide
 * distribution that turns a raw incident load into "safer than X% of San Francisco".
 *
 * Run: npm run sync   (takes a couple of minutes, needs network; scoring is offline after)
 *
 * Notes that cost real debugging time and are worth keeping:
 *  - Category strings are dirty. "Motor Vehicle Theft?" carries a question mark and both
 *    "Weapons Offense" and "Weapons Offence" exist. An IN(...) filter drops them silently.
 *  - Drug offences are deliberately excluded. SF drug counts track enforcement intensity,
 *    not danger, so including them would score active policing as risk.
 *  - Roughly one in seven incidents is filed online by the reporter. Those carry coarse
 *    locations, so they are dropped from anything distance-sensitive.
 *  - The 311 dataset's queryable geometry is `point_geom`, not `point` as in the incident
 *    dataset. Using the wrong one returns an unhelpful error.
 */

import { db, cacheGet, cacheSet } from '../lib/db.js';
import { distanceMetres } from '../lib/geo.js';
import { DATA, SAFETY } from '../lib/config.js';

const PAGE = 50_000;
const log = (...a) => console.log(...a);

async function soda(base, params) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const qs = new URLSearchParams({ ...params, $limit: String(PAGE), $offset: String(offset) });
    const url = `${base}?${qs}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${base}`);
    const page = await res.json();
    rows.push(...page);
    process.stdout.write(`\r  ${rows.length} rows`);
    if (page.length < PAGE) break;
  }
  process.stdout.write('\n');
  return rows;
}

const insert = db.prepare(
  `INSERT INTO incident (id, kind, category, occurred, hour, neighborhood, lat, lng)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO NOTHING`
);
const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(...r)));

function quote(list) {
  return list.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
}

async function syncIncidents(kind, categories, months) {
  log(`\n[${kind}] last ${months} months`);
  const since = new Date(Date.now() - months * 30.44 * 86400e3).toISOString().slice(0, 10);
  const rows = await soda(DATA.sfIncidents, {
    $select: 'row_id,incident_datetime,incident_category,analysis_neighborhood,latitude,longitude,filed_online',
    $where: `incident_datetime >= '${since}' AND incident_category IN (${quote(categories)}) AND latitude IS NOT NULL`,
  });

  let skippedOnline = 0;
  const prepared = [];
  for (const r of rows) {
    // Self-filed reports give the reporter's location, not the scene. Useless for radius work.
    if (r.filed_online === true || r.filed_online === 'true') { skippedOnline += 1; continue; }
    const lat = +r.latitude;
    const lng = +r.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dt = r.incident_datetime || '';
    prepared.push([
      `${kind}:${r.row_id}`,
      kind,
      r.incident_category || null,
      dt.slice(0, 10),
      dt.length >= 13 ? +dt.slice(11, 13) : null,
      r.analysis_neighborhood || null,
      lat,
      lng,
    ]);
  }
  insertMany(prepared);
  log(`  kept ${prepared.length} rows (${skippedOnline} online-filed reports skipped)`);
  return prepared.length;
}

async function syncStreet(months) {
  log(`\n[street] 311 street conditions, last ${months} months`);
  const since = new Date(Date.now() - months * 30.44 * 86400e3).toISOString().slice(0, 10);
  const rows = await soda(DATA.sf311, {
    $select: 'service_request_id,requested_datetime,service_details,analysis_neighborhood,lat,long',
    $where:
      `requested_datetime >= '${since}' AND lat IS NOT NULL ` +
      `AND service_details IN (${quote(SAFETY.streetDetails)})`,
  });

  const prepared = rows
    .map((r) => {
      const lat = +r.lat;
      const lng = +r.long;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const dt = r.requested_datetime || '';
      return [
        `street:${r.service_request_id}`,
        'street',
        r.service_details || null,
        dt.slice(0, 10),
        dt.length >= 13 ? +dt.slice(11, 13) : null,
        r.analysis_neighborhood || null,
        lat,
        lng,
      ];
    })
    .filter(Boolean);

  insertMany(prepared);
  log(`  kept ${prepared.length} rows`);
  return prepared.length;
}

/**
 * Build the citywide reference distribution.
 *
 * Sample a grid over the city, compute the same decayed load the scorer uses, and keep the
 * sorted array. A listing's percentile is then a binary search. Cells with no activity
 * anywhere near them are dropped, which conveniently removes the ocean and the bay.
 */
/**
 * How many registered addresses sit in each grid cell.
 *
 * This becomes the weight in the citywide distribution, and it is the difference between
 * a number that sounds alarming and one that helps. Ranking a block against every acre of
 * San Francisco puts almost any dense, walkable street in the worst few percent, because
 * most of the city's *land* is quiet low-density west side. Ranking it against every
 * *home* answers the question actually being asked: out of the places a person could
 * plausibly live, how does this one compare.
 */
async function addressWeights(CELL) {
  const cached = cacheGet('address-weights', 365);
  if (cached) {
    log(`  address density: reusing cache, ${Object.keys(cached).length} grid cells`);
    return new Map(Object.entries(cached));
  }
  log('  downloading every address in the city (once, then cached)');
  const rows = await soda(DATA.sfAddresses, { $select: 'latitude,longitude' });
  const weights = new Map();
  for (const r of rows) {
    const la = +r.latitude;
    const ln = +r.longitude;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    const k = `${Math.floor(la / CELL)}:${Math.floor(ln / CELL)}`;
    weights.set(k, (weights.get(k) || 0) + 1);
  }
  cacheSet('address-weights', Object.fromEntries(weights));
  log(`  address density: ${rows.length} addresses across ${weights.size} grid cells`);
  return weights;
}

async function buildDistributions() {
  const { fromHour, toHour, multiplier } = SAFETY.night;
  const STEP = 0.00225; // about 250 m
  const bounds = { minLat: 37.705, maxLat: 37.833, minLng: -122.515, maxLng: -122.355 };
  const CELL = 0.0045;
  const KINDS = ['personal', 'property', 'street'];
  const weights = await addressWeights(CELL);

  // Bucket incidents by coarse cell so each grid point scans only its own neighbourhood
  // instead of all 50,000 rows.
  const buckets = {};
  for (const kind of KINDS) {
    const rows = db.prepare('SELECT lat, lng, hour FROM incident WHERE kind = ?').all(kind);
    const map = new Map();
    for (const r of rows) {
      const k = `${Math.floor(r.lat / CELL)}:${Math.floor(r.lng / CELL)}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    buckets[kind] = map;
  }

  const loadAt = (lat, lng, kind, radius) => {
    const ci = Math.floor(lat / CELL);
    const cj = Math.floor(lng / CELL);
    const span = Math.ceil(radius / 111_320 / CELL) + 1;
    let load = 0;
    let any = false;
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        const list = buckets[kind].get(`${i}:${j}`);
        if (!list) continue;
        for (const r of list) {
          const d = distanceMetres(lat, lng, r.lat, r.lng);
          if (d > radius) continue;
          any = true;
          const night = r.hour == null ? 1 : r.hour >= fromHour || r.hour < toHour ? multiplier : 1;
          load += Math.exp(-d / SAFETY.decayMetres) * night;
        }
      }
    }
    return { load, any };
  };

  const w = SAFETY.weights;
  const wSum = w.personal + w.property + w.street;
  const series = { personal: [], property: [], street: [], composite: [] };

  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += STEP) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += STEP) {
      const homes = weights.get(`${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`) || 0;
      // No registered address nearby means water, park or industrial land. Nobody is
      // choosing to rent there, so it should not sit in the comparison set.
      if (homes === 0) continue;

      const p = loadAt(lat, lng, 'personal', SAFETY.radius.personal);
      const q = loadAt(lat, lng, 'property', SAFETY.radius.property);
      const s = loadAt(lat, lng, 'street', SAFETY.radius.street);
      series.personal.push([p.load, homes]);
      series.property.push([q.load, homes]);
      series.street.push([s.load, homes]);
      series.composite.push([(w.personal * p.load + w.property * q.load + w.street * s.load) / wSum, homes]);
    }
  }

  for (const [name, pairs] of Object.entries(series)) {
    pairs.sort((a, b) => a[0] - b[0]);
    const values = pairs.map((x) => x[0]);
    // Prefix sums of the home counts, so a percentile lookup is a binary search on value
    // followed by one array read.
    const cum = new Array(pairs.length);
    let running = 0;
    for (let i = 0; i < pairs.length; i++) { running += pairs[i][1]; cum[i] = running; }
    cacheSet(`distribution:${name}`, { values, cum, total: running, cells: pairs.length });
  }

  const c = series.composite;
  const totalHomes = c.reduce((s, x) => s + x[1], 0);
  log(`  ${c.length} inhabited grid cells covering ${totalHomes.toLocaleString()} addresses`);
  log(`  median of the combined distribution: ${c[Math.floor(c.length / 2)]?.[0].toFixed(2)}`);
  return c.length;
}

const main = async () => {
  const t0 = Date.now();
  const counts = {};
  counts.personal = await syncIncidents('personal', SAFETY.personalCategories, SAFETY.months.personal);
  counts.property = await syncIncidents('property', SAFETY.propertyCategories, SAFETY.months.property);
  counts.street = await syncStreet(SAFETY.months.street);

  // Drop anything that has aged out, so the local mirror matches the scoring window.
  const pruned = db
    .prepare(`DELETE FROM incident WHERE occurred < date('now', '-13 months')`)
    .run().changes;
  if (pruned) log(`\npruned ${pruned} rows past the retention window`);

  log('\nbuilding the citywide distribution, which is what the percentile context reads from');
  buildDistributions();

  db.prepare(
    `INSERT INTO sync_log (source, synced_at, row_count, note) VALUES ('sfdata', datetime('now'), ?, ?)
     ON CONFLICT(source) DO UPDATE SET synced_at = excluded.synced_at, row_count = excluded.row_count, note = excluded.note`
  ).run(
    counts.personal + counts.property + counts.street,
    JSON.stringify(counts)
  );

  log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  log(JSON.stringify(counts, null, 2));
};

main().catch((err) => {
  // "fetch failed" alone says nothing; the cause names the network error.
  console.error('\nsync failed:', err.message, err.cause?.code || err.cause?.message || '');
  process.exit(1);
});

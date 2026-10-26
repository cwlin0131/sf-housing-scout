import { db } from './db.js';
import { loadZones } from './zones.js';
import { SAFETY } from './config.js';

/**
 * The numbers behind the map, as a table.
 *
 * The heat overlay is a characterisation; this is the audit trail. It shows what was
 * actually counted, per neighbourhood, per category, with the sources that informed the
 * curated tiers, so a tier can be argued with rather than taken on faith.
 */

const CAT_LABEL = {
  Assault: 'assault', Robbery: 'robbery', Homicide: 'homicide', Rape: 'rape',
  'Sex Offense': 'sex_offense', 'Weapons Offense': 'weapons', 'Weapons Offence': 'weapons',
  'Weapons Carrying Etc': 'weapons_carrying',
  Burglary: 'burglary', 'Larceny Theft': 'larceny', 'Motor Vehicle Theft': 'vehicle_theft',
  'Motor Vehicle Theft?': 'vehicle_theft', Arson: 'arson', 'Malicious Mischief': 'mischief',
  Vandalism: 'vandalism',
  human_waste_or_urine: 'human_waste', needles_less_than_20: 'needles',
};

export function crimeTable() {
  const total = db.prepare('SELECT COUNT(*) n FROM incident').get().n;
  const zones = loadZones();

  if (!total) {
    return {
      hasData: false,
      noteCode: 'not_synced',
      zones: zones.zones.map(({ bbox, polygon, ...z }) => z),
      sources: zones.sources || [],
      window: SAFETY.months,
    };
  }

  const byNeighborhood = db
    .prepare(
      `SELECT COALESCE(neighborhood, '') AS name,
              SUM(kind = 'personal') AS personal,
              SUM(kind = 'property') AS property,
              SUM(kind = 'street')   AS street,
              SUM(kind = 'personal' AND (hour >= ? OR hour < ?)) AS personal_night,
              COUNT(*) AS total
       FROM incident
       GROUP BY name
       ORDER BY personal DESC`
    )
    .all(SAFETY.night.fromHour, SAFETY.night.toHour);

  const byCategory = db
    .prepare(
      `SELECT kind, category, COUNT(*) n FROM incident
       GROUP BY kind, category ORDER BY kind, n DESC`
    )
    .all()
    .map((r) => ({ ...r, label: CAT_LABEL[r.category] || r.category }));

  // Cross-reference the measured counts with the curated tier, so disagreement is visible
  // rather than hidden behind one number.
  const tierByName = new Map();
  for (const z of zones.zones) tierByName.set(z.name.toLowerCase(), z);
  const rows = byNeighborhood.map((r) => {
    const z =
      tierByName.get(r.name.toLowerCase()) ||
      zones.zones.find((zz) => r.name.toLowerCase().includes(zz.name.toLowerCase()) ||
                               zz.name.toLowerCase().includes(r.name.toLowerCase()));
    return {
      ...r,
      nightShare: r.personal ? Math.round((r.personal_night / r.personal) * 100) : null,
      tier: z?.tier ?? null,
      zoneName: z?.name ?? null,
    };
  });

  const sync = db.prepare(`SELECT * FROM sync_log WHERE source='sfdata'`).get();

  return {
    hasData: true,
    total,
    syncedAt: sync?.synced_at || null,
    window: SAFETY.months,
    radius: SAFETY.radius,
    neighborhoods: rows,
    categories: byCategory,
    zones: zones.zones.map(({ bbox, polygon, ...z }) => z),
    sources: zones.sources || [],
    method: {
      excluded: { code: 'excluded' },
      filedOnline: { code: 'filed_online' },
      perCapita: { code: 'per_capita' },
      night: { code: 'night', from: SAFETY.night.fromHour, to: SAFETY.night.toHour, x: SAFETY.night.multiplier },
      decay: { code: 'decay', metres: SAFETY.decayMetres },
    },
  };
}

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_ANCHORS } from './config.js';

const DB_PATH = resolve(process.cwd(), 'data/sf-housing.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS listing (
  id              INTEGER PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'zillow',   -- zillow | screenshot | manual
  source_id       TEXT,                             -- zpid or lotId when we have one
  url             TEXT,
  title           TEXT,

  address         TEXT NOT NULL,
  city            TEXT DEFAULT 'San Francisco',
  zip             TEXT,
  neighborhood    TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,

  unit_type       TEXT,          -- studio | 1b1b | other
  beds            REAL,
  baths           REAL,
  sqft            INTEGER,

  price           INTEGER,
  monthly_fees    INTEGER,
  deposit         INTEGER,
  lease_term      TEXT,
  pets            TEXT,
  parking         TEXT,
  laundry         TEXT,
  furnished       INTEGER,
  available_from  TEXT,
  -- When the listing went up, stored as a date rather than "N days ago": a stored count
  -- silently ages into a wrong number, while a date stays true and the count is derived
  -- at display time. The listed_basis column records whether the source gave a date or a count.
  listed_at       TEXT,
  listed_basis    TEXT,

  walk_score      INTEGER,
  transit_score   INTEGER,
  bike_score      INTEGER,

  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT,
  -- candidate: scored, awaiting the keep-or-drop decision
  -- saved: on the list | rejected: dropped, kept so dedupe can remind him
  -- deactivated: was saved, listing has since gone away
  status          TEXT NOT NULL DEFAULT 'candidate',
  deactivated_at  TEXT,
  deactivate_reason TEXT,

  refreshable     INTEGER NOT NULL DEFAULT 1,  -- 0 for screenshot-only entries
  notes           TEXT,
  raw_json        TEXT,

  -- Orthogonal to status: staying shortlisted after a listing is gone is useful
  -- rather than contradictory, so the two never affect each other.
  shortlist       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_listing_status ON listing(status);
CREATE INDEX IF NOT EXISTS idx_listing_source ON listing(source, source_id);
CREATE INDEX IF NOT EXISTS idx_listing_geo ON listing(lat, lng);

CREATE TABLE IF NOT EXISTS listing_snapshot (
  id           INTEGER PRIMARY KEY,
  listing_id   INTEGER NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
  checked_at   TEXT NOT NULL DEFAULT (datetime('now')),
  price        INTEGER,
  home_status  TEXT,
  still_listed INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_snap_listing ON listing_snapshot(listing_id, checked_at);

CREATE TABLE IF NOT EXISTS score (
  listing_id     INTEGER PRIMARY KEY REFERENCES listing(id) ON DELETE CASCADE,
  safety         REAL,
  convenience    REAL,
  price_score    REAL,
  overall_stars  REAL,          -- only when the optional composite is switched on
  breakdown_json TEXT,
  rubric_version TEXT NOT NULL,
  -- The weights and budget in force when this score was computed. Once those are
  -- user-editable, the rubric version alone no longer says whether two scores were
  -- measured with the same ruler, and comparing a months-old list depends on it.
  settings_json  TEXT,
  computed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Runtime-editable settings. One row per key, value is JSON so a key can hold a
-- scalar or an object without a schema change.
CREATE TABLE IF NOT EXISTS setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review (
  listing_id     INTEGER PRIMARY KEY REFERENCES listing(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  model          TEXT,
  prompt_version TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Places that matter to the user. Seeded with defaults, extended by dropping a pin.
CREATE TABLE IF NOT EXISTS anchor (
  id       INTEGER PRIMARY KEY,
  key      TEXT UNIQUE,
  name     TEXT NOT NULL,
  note     TEXT,
  address  TEXT,
  lat      REAL NOT NULL,
  lng      REAL NOT NULL,
  weight   REAL NOT NULL DEFAULT 1,
  mode     TEXT NOT NULL DEFAULT 'walk',
  pinned   INTEGER NOT NULL DEFAULT 1,   -- shown on the map
  scored   INTEGER NOT NULL DEFAULT 1,   -- counts toward the convenience score
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Geo lookups are slow and repeat constantly as the user pastes listings on the same
-- block. Cache keyed by rounded coordinate so nearby listings reuse the same answer.
CREATE TABLE IF NOT EXISTS geo_cache (
  cache_key  TEXT PRIMARY KEY,   -- e.g. "amenities:37.7844:-122.3944:800"
  payload    TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Local mirror of the SFPD / 311 pulls so scoring runs offline.
CREATE TABLE IF NOT EXISTS incident (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,      -- personal | property | street
  category  TEXT,
  occurred  TEXT NOT NULL,
  hour      INTEGER,
  neighborhood TEXT,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_geo ON incident(lat, lng);
CREATE INDEX IF NOT EXISTS idx_incident_kind ON incident(kind, occurred);

CREATE TABLE IF NOT EXISTS sync_log (
  source     TEXT PRIMARY KEY,
  synced_at  TEXT NOT NULL,
  row_count  INTEGER,
  note       TEXT
);
`);

/**
 * Additive migrations. `CREATE TABLE IF NOT EXISTS` silently skips a table that already
 * exists, so new columns have to be added explicitly for databases created by an earlier
 * version. Each entry is safe to run repeatedly.
 */
const migrations = [
  ['incident', 'neighborhood', 'TEXT'],
  ['listing', 'shortlist', 'INTEGER NOT NULL DEFAULT 0'],
  ['listing', 'listed_at', 'TEXT'],
  ['listing', 'listed_basis', 'TEXT'],
  ['score', 'settings_json', 'TEXT'],
  ['review', 'lang', 'TEXT'],
];
for (const [table, column, type] of migrations) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_incident_nbhd ON incident(neighborhood, kind)`);

// Seed the default anchors once. `key` is unique so re-running is a no-op, and anything
// the user edits later survives a restart.
const seed = db.prepare(`
  INSERT INTO anchor (key, name, note, lat, lng, weight, mode)
  VALUES (@key, @name, @note, @lat, @lng, @weight, @mode)
  ON CONFLICT(key) DO NOTHING
`);
db.transaction(() => DEFAULT_ANCHORS.forEach((a) => seed.run(a)))();

export function readSettings() {
  const rows = db.prepare('SELECT key, value FROM setting').all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { /* skip a corrupt row rather than fail startup */ }
  }
  return out;
}

export function writeSetting(key, value) {
  db.prepare(
    `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value));
}

export function cacheGet(key, maxAgeDays = 30) {
  const row = db
    .prepare(`SELECT payload FROM geo_cache WHERE cache_key = ? AND fetched_at > datetime('now', ?)`)
    .get(key, `-${maxAgeDays} days`);
  return row ? JSON.parse(row.payload) : null;
}

export function cacheSet(key, payload) {
  db.prepare(
    `INSERT INTO geo_cache (cache_key, payload, fetched_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(key, JSON.stringify(payload));
}

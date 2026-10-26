import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { db } from './lib/db.js';
import { USER_DIR } from './lib/paths.js';
import { state as fetchState, markUnblocked, shutdown } from './lib/fetcher.js';
import { allZones, reload as reloadZones } from './lib/zones.js';
import { crimeTable } from './lib/crimetable.js';
import { geocode, anchors } from './lib/geo.js';
import { isZillowUrl } from './lib/zillow.js';
import { RUBRIC_VERSION, LIFESTYLE, apiKey, KEY_HELP } from './lib/config.js';
import { settings, updateSettings } from './lib/settings.js';
import { AppError, fail as failWith } from './lib/errors.js';
import { pickLang } from './lib/review.js';
import {
  candidateFromUrl, candidateFromImages, candidateFromAddress,
  saveCandidate, listListings, getListing, setStatus, setShortlist, refreshListings, rescoreAll,
} from './lib/listings.js';

const app = Fastify({ logger: false, bodyLimit: 40 * 1024 * 1024 }); // screenshots are large
await app.register(cors, { origin: true });

const ok = (reply, data) => reply.send({ ok: true, ...data });
/**
 * Errors travel as a stable `code` plus English text. The interface translates the code;
 * the text is what a log or a raw response shows. Anything that is not an AppError has no
 * code, so the client falls back to the message.
 */
const fail = (reply, err, status = 400) =>
  reply.code(status).send({
    ok: false,
    code: err?.code || null,
    meta: err?.meta || null,
    error: String(err?.message || err),
  });

// Candidates live in memory between "score it" and "keep it". They are cheap to rebuild
// and there is no reason to write a row the user has not agreed to yet.
const pending = new Map();
let nextToken = 1;

function stash(candidate) {
  const token = String(nextToken++);
  pending.set(token, candidate);
  if (pending.size > 40) pending.delete(pending.keys().next().value);
  const { _rawJson, ...safe } = candidate;
  return { token, ...safe };
}

// ---------------------------------------------------------------- status

app.get('/api/status', async (_req, reply) => {
  const sync = db.prepare(`SELECT * FROM sync_log WHERE source='sfdata'`).get();
  const counts = db
    .prepare(`SELECT status, COUNT(*) n FROM listing GROUP BY status`)
    .all()
    .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {});
  const incidents = db.prepare('SELECT COUNT(*) n FROM incident').get().n;
  return ok(reply, {
    fetcher: fetchState,
    sync: sync || null,
    incidents,
    counts,
    zones: allZones().zones.length,
    config: { ...settings(), rubricVersion: RUBRIC_VERSION, lifestyle: LIFESTYLE },
    hasApiKey: !!apiKey(),
    keyHelp: apiKey() ? null : KEY_HELP,
  });
});

app.post('/api/fetcher/unblock', async (_req, reply) =>
  ok(reply, { resumed: markUnblocked() })
);

// ---------------------------------------------------------------- map layers

// ---------------------------------------------------------------- settings

/** Geocode the core address only when it changed, so saving other settings stays offline. */
async function locateHome(home) {
  const address = String(home.address || '').trim();
  const label = String(home.label || '').trim().slice(0, 60);
  if (!address) return { label: '', address: '', lat: null, lng: null };
  const current = settings().home;
  if (current.address === address && current.lat != null) return { ...current, label };
  const point = await geocode(address);
  if (!point) failWith('settings.home_geocode_failed', `Could not find that address: ${address}`, { address });
  return { label, address, lat: point.lat, lng: point.lng };
}

app.get('/api/settings', async (_req, reply) => ok(reply, { settings: settings() }));

app.patch('/api/settings', async (req, reply) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.home) body.home = await locateHome(body.home);
    const next = updateSettings(body);
    // The core address only changes commute times, which are worked out on read, so it
    // does not need the slow rescore.
    if (Object.keys(body).every((k) => k === 'home')) return ok(reply, { settings: next, rescored: 0 });
    // Stored scores were computed under the old numbers, so they are stale the moment
    // these change. Rescoring here keeps the list internally consistent rather than
    // leaving the user to notice and press a button.
    const { rescored } = await rescoreAll();
    return ok(reply, { settings: next, rescored });
  } catch (err) {
    return fail(reply, err);
  }
});

app.get('/api/zones', async (_req, reply) => ok(reply, allZones()));
app.get('/api/crime-table', async (_req, reply) => ok(reply, crimeTable()));
app.post('/api/zones/reload', async (_req, reply) => ok(reply, { zones: reloadZones().zones.length }));

app.get('/api/transit', async (_req, reply) => {
  const read = (f) => {
    const p = resolve(process.cwd(), 'data', f);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { type: 'FeatureCollection', features: [] };
  };
  return ok(reply, { lines: read('transit-lines.geojson'), stops: read('transit-stops.geojson') });
});

// ---------------------------------------------------------------- anchors (own pins)

app.get('/api/anchors', async (_req, reply) => ok(reply, { anchors: anchors() }));

app.post('/api/anchors', async (req, reply) => {
  try {
    const { name, address, lat, lng, note, weight = 1, mode = 'walk', scored = 1 } = req.body || {};
    if (!name) failWith('anchor.name_required', 'Give the place a name.');
    let point = lat != null && lng != null ? { lat: +lat, lng: +lng } : null;
    if (!point) {
      if (!address) failWith('anchor.location_required', 'Give the place an address or coordinates.');
      point = await geocode(address);
      if (!point) failWith('anchor.geocode_failed', `Could not find that address: ${address}`, { address });
    }
    const info = db
      .prepare(
        `INSERT INTO anchor (name, note, address, lat, lng, weight, mode, scored)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(name, note ?? null, address ?? null, point.lat, point.lng, +weight, mode, scored ? 1 : 0);
    return ok(reply, { anchor: db.prepare('SELECT * FROM anchor WHERE id=?').get(info.lastInsertRowid) });
  } catch (err) {
    return fail(reply, err);
  }
});

app.patch('/api/anchors/:id', async (req, reply) => {
  try {
    const fields = ['name', 'note', 'weight', 'mode', 'pinned', 'scored', 'lat', 'lng'];
    const set = fields.filter((f) => req.body?.[f] !== undefined);
    if (!set.length) failWith('anchor.nothing_to_update', 'Nothing to change.');
    db.prepare(`UPDATE anchor SET ${set.map((f) => `${f}=@${f}`).join(',')} WHERE id=@id`)
      .run({ ...req.body, id: +req.params.id });
    return ok(reply, { anchor: db.prepare('SELECT * FROM anchor WHERE id=?').get(+req.params.id) });
  } catch (err) {
    return fail(reply, err);
  }
});

app.delete('/api/anchors/:id', async (req, reply) => {
  db.prepare('DELETE FROM anchor WHERE id=?').run(+req.params.id);
  return ok(reply, { deleted: +req.params.id });
});

// ---------------------------------------------------------------- add a listing

/** One endpoint for all three inputs, because from the user's side it is one box. */
app.post('/api/candidates', async (req, reply) => {
  try {
    const { input, images, url } = req.body || {};
    // The written note is generated in whatever language the interface is set to.
    const lang = pickLang(req.headers['accept-language']);

    if (Array.isArray(images) && images.length) {
      const parsed = images.map((raw, i) => {
        const m = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(raw);
        if (!m) failWith('listing.bad_image', `Image ${i + 1} is not in a format we can read.`, { index: i + 1 });
        return { mediaType: m[1].toLowerCase().replace('image/jpg', 'image/jpeg'), data: m[3] };
      });
      return ok(reply, stash(await candidateFromImages(parsed, url || null, lang)));
    }

    const text = (input || '').trim();
    if (!text) failWith('listing.empty_input', 'Paste a Zillow link, an address, or a screenshot.');
    if (isZillowUrl(text)) return ok(reply, stash(await candidateFromUrl(text, lang)));
    if (/^https?:\/\//i.test(text)) {
      failWith('listing.url_not_supported',
               'Only Zillow links are read automatically. Paste a screenshot for anything else.');
    }
    return ok(reply, stash(await candidateFromAddress(text, lang)));
  } catch (err) {
    return fail(reply, err);
  }
});

app.post('/api/candidates/:token/save', async (req, reply) => {
  try {
    const candidate = pending.get(req.params.token);
    if (!candidate) failWith('candidate.expired', 'That preview has expired. Paste it again.');
    // Let the user fix anything the screenshot reader got wrong before it is committed.
    if (req.body?.edits) Object.assign(candidate.listing, req.body.edits);
    const saved = saveCandidate(candidate, req.body?.status || 'saved');
    pending.delete(req.params.token);
    return ok(reply, { listing: saved });
  } catch (err) {
    return fail(reply, err);
  }
});

app.post('/api/candidates/:token/reject', async (req, reply) => {
  try {
    const candidate = pending.get(req.params.token);
    if (!candidate) failWith('candidate.expired', 'That preview has expired. Paste it again.');
    const saved = saveCandidate(candidate, 'rejected');
    pending.delete(req.params.token);
    return ok(reply, { listing: saved });
  } catch (err) {
    return fail(reply, err);
  }
});

// ---------------------------------------------------------------- the list

app.get('/api/listings', async (req, reply) =>
  ok(reply, { listings: listListings({ status: req.query.status || 'saved' }) })
);

app.get('/api/listings/:id', async (req, reply) => {
  const row = getListing(+req.params.id);
  return row ? ok(reply, { listing: row }) : fail(reply, new AppError('listing.not_found', 'No such listing.'), 404);
});

app.patch('/api/listings/:id', async (req, reply) => {
  try {
    const id = +req.params.id;
    if (req.body?.status) setStatus(id, req.body.status, req.body.reason);
    if (req.body?.notes !== undefined) {
      db.prepare('UPDATE listing SET notes=? WHERE id=?').run(req.body.notes || null, id);
    }
    if (req.body?.shortlist !== undefined) setShortlist(id, req.body.shortlist);
    return ok(reply, { listing: getListing(id) });
  } catch (err) {
    return fail(reply, err);
  }
});

app.get('/api/listings/:id/history', async (req, reply) =>
  ok(reply, {
    snapshots: db
      .prepare('SELECT * FROM listing_snapshot WHERE listing_id=? ORDER BY checked_at')
      .all(+req.params.id),
  })
);

app.post('/api/refresh', async (req, reply) => {
  try {
    return ok(reply, await refreshListings(Math.min(+(req.body?.limit || 10), 25)));
  } catch (err) {
    return fail(reply, err);
  }
});

app.post('/api/rescore', async (_req, reply) => {
  try {
    return ok(reply, await rescoreAll());
  } catch (err) {
    return fail(reply, err);
  }
});

// ---------------------------------------------------------------- serve the UI in prod

const dist = resolve(process.cwd(), 'dist');
if (existsSync(dist)) {
  const staticPlugin = (await import('@fastify/static')).default;
  await app.register(staticPlugin, { root: dist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ ok: false, error: 'not found' })
                               : reply.sendFile('index.html')
  );
}

const PORT = +(process.env.PORT || 8787);
await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`SF Housing Scout API  http://127.0.0.1:${PORT}`);
console.log(`Your data: ${USER_DIR}`);
if (apiKey()) {
  console.log('API key loaded. Screenshot reading and written notes are available.');
} else {
  console.log(`Screenshot reading and written notes are off; everything else works. ${KEY_HELP}`);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { shutdown(); process.exit(0); });
}

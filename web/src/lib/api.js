import { t, tError, locale } from '../i18n/index.js';

async function call(path, options = {}) {
  // Content-Type only with a body: the server refuses an empty body that claims to be
  // JSON, which used to make deleting a pin fail without a word.
  const headers = { 'Accept-Language': locale() };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: `${res.status} ${res.statusText}` }));
  if (!json.ok) {
    // Carry the code through so the interface can translate it. The English `error` is
    // the fallback for anything the locale files do not cover.
    const err = new Error(tError(json));
    err.code = json.code;
    err.meta = json.meta;
    throw err;
  }
  return json;
}

export const api = {
  status: () => call('/status'),
  unblock: () => call('/fetcher/unblock', { method: 'POST' }),

  settings: () => call('/settings'),
  saveSettings: (body) => call('/settings', { method: 'PATCH', body }),

  zones: () => call('/zones'),
  crimeTable: () => call('/crime-table'),
  transit: () => call('/transit'),

  anchors: () => call('/anchors'),
  addAnchor: (body) => call('/anchors', { method: 'POST', body }),
  updateAnchor: (id, body) => call(`/anchors/${id}`, { method: 'PATCH', body }),
  deleteAnchor: (id) => call(`/anchors/${id}`, { method: 'DELETE' }),

  score: (body) => call('/candidates', { method: 'POST', body }),
  keep: (token, body) => call(`/candidates/${token}/save`, { method: 'POST', body: body || {} }),
  drop: (token) => call(`/candidates/${token}/reject`, { method: 'POST' }),

  listings: (status = 'saved') => call(`/listings?status=${status}`),
  history: (id) => call(`/listings/${id}/history`),
  patchListing: (id, body) => call(`/listings/${id}`, { method: 'PATCH', body }),
  mark: (id, marks) => call(`/listings/${id}`, { method: 'PATCH', body: marks }),
  refresh: (limit) => call('/refresh', { method: 'POST', body: { limit } }),
  rescore: () => call('/rescore', { method: 'POST' }),
};

export const money = (n) => (n == null ? '–' : `$${n.toLocaleString('en-US')}`);

export function starGlyphs(stars) {
  if (stars == null) return '–';
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  return '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}

export const tone = (v) => (v == null ? '' : v >= 70 ? 'good' : v >= 45 ? 'warn' : 'bad');

/** Colour ramp for the curated area tiers: 1 avoid, 5 comfortable. */
export const TIER_COLORS = {
  1: '#B23B3B',
  2: '#C4703A',
  3: '#C7A24A',
  4: '#6E9E63',
  5: '#4E9E8E',
};
/** Read through this rather than a constant map, so it follows the language. */
export const tierLabel = (tier) => t(`tier.${tier}`);

/**
 * How long a listing has been up, worked out from the stored date each time it is shown.
 * The count is never stored: "5 days ago" written to the database is wrong by tomorrow.
 */
export function listedAge(listedAt) {
  if (!listedAt) return null;
  const then = new Date(`${listedAt}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.max(0, Math.round((Date.now() - then.getTime()) / 86400e3));
  return { days, label: days === 0 ? t('detail.listed_today') : t('detail.listed_days', { n: days }) };
}

/**
 * Values the server sends as `{ code, ...meta }` rather than as a sentence, so the
 * interface picks the language. Older rows hold plain text and are passed through.
 */
const coded = (prefix) => (v) => {
  if (!v) return '';
  if (typeof v === 'string') {
    // Rows written before codes existed, and the bare codes the client itself sends.
    const key = `${prefix}.${v}`;
    return t(key) === key ? v : t(key);
  }
  return t(`${prefix}.${v.code}`, v);
};

export const dupReason = coded('dup');
export const goneReason = (raw) => {
  if (!raw) return '';
  try { return coded('gone')(JSON.parse(raw)); } catch { return coded('gone')(raw); }
};
export const fetcherMessage = (f) =>
  (f?.messageCode ? t(`fetch.${f.messageCode}`, f.messageMeta || {}) : f?.message || '');

/**
 * Pick the current language out of a `{ en, zh }` field.
 *
 * The curated area reads ship in both languages in one file rather than being fetched per
 * language, because there are only two and the whole set is 60KB. Falls back to English,
 * then to the value itself, so a zone file written before this shape still renders.
 */
export function pick(field) {
  if (field == null) return field;
  if (typeof field === 'string' || Array.isArray(field)) return field;
  return field[locale()] ?? field.en ?? '';
}

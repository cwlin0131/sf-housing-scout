import { readSettings, writeSetting } from './db.js';
import { fail } from './errors.js';
import { DEFAULT_SETTINGS } from './config.js';

/**
 * The user-editable half of the rubric.
 *
 * Stored per key in the database and layered over the defaults in config.js, so a
 * key added in a later version picks up its default without a migration. Read
 * through settings() rather than importing the defaults directly, or a change made
 * in the UI will not reach the code that needs it.
 */

const merge = (base, patch) =>
  Object.fromEntries(
    Object.entries(base).map(([k, v]) => [
      k,
      v && typeof v === 'object' && !Array.isArray(v) ? { ...v, ...(patch?.[k] || {}) } : (patch?.[k] ?? v),
    ])
  );

export function settings() {
  return merge(DEFAULT_SETTINGS, readSettings());
}

const NUMBER_RULES = {
  'budget.max': { min: 100, max: 100_000 },
  'budget.ideal': { min: 0, max: 100_000 },
  'composite.safety': { min: 0, max: 1 },
  'composite.convenience': { min: 0, max: 1 },
};

/**
 * Apply a partial update. Validates rather than trusting the client: a budget of 0
 * or a weight of 12 would produce scores that look plausible and are meaningless.
 */
export function updateSettings(patch) {
  const next = merge(settings(), patch);

  for (const [path, rule] of Object.entries(NUMBER_RULES)) {
    const [group, key] = path.split('.');
    const v = next[group]?.[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      fail('settings.not_a_number', `${path} has to be a number.`, { path });
    }
    if (v < rule.min || v > rule.max) {
      fail('settings.out_of_range', `${path} has to be between ${rule.min} and ${rule.max}.`,
           { path, min: rule.min, max: rule.max });
    }
  }
  if (next.budget.ideal > next.budget.max) {
    fail('settings.ideal_above_max', 'The sweet spot cannot be higher than the reference line.');
  }
  if (next.composite.safety + next.composite.convenience <= 0) {
    fail('settings.weights_both_zero', 'The two weights cannot both be zero.');
  }
  if (typeof next.composite.enabled !== 'boolean') {
    fail('settings.not_a_boolean', 'composite.enabled has to be true or false.', { path: 'composite.enabled' });
  }
  // An avoided area caps a score, so a malformed entry would silently stop capping.
  if (!Array.isArray(next.avoid)) next.avoid = [];
  for (const a of next.avoid) {
    const ok = a && typeof a.name === 'string' && a.name.trim()
      && typeof a.cap === 'number' && a.cap >= 0 && a.cap <= 100;
    if (!ok) fail('settings.avoid_invalid', 'Each avoided area needs a name and a cap between 0 and 100.');
  }
  next.avoid = next.avoid.map((a) => ({ name: a.name.trim(), cap: Math.round(a.cap) }));

  // The core address arrives already geocoded by the route; anything else is a bug.
  const h = next.home;
  const located = typeof h?.lat === 'number' && typeof h?.lng === 'number';
  if (!h || (h.address && !located) || (!h.address && (h.lat != null || h.lng != null))) {
    fail('settings.home_invalid', 'The core address needs both an address and a location.');
  }

  for (const key of Object.keys(patch || {})) {
    if (key in DEFAULT_SETTINGS) writeSetting(key, next[key]);
  }
  return settings();
}

/**
 * The subset stored alongside each score, so a list built over months stays
 * comparable: the rubric version covers the code, this covers the knobs.
 */
export function scoringSnapshot() {
  const s = settings();
  return { budget: s.budget, composite: s.composite };
}

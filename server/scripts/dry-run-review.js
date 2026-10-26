#!/usr/bin/env node
/**
 * Runs the current review prompt over a fixed set of addresses so wording
 * changes can be compared side by side.
 *
 *   npm run dry-run                 # five calibration addresses, in English
 *   npm run dry-run -- --lang zh    # the same five, in Chinese
 *   npm run dry-run -- "500 Castro St" "1160 Battery St"
 *
 * The addresses are deliberately spread across the safety and convenience
 * range: if a prompt reads well on the quiet end and the busy end alike, it is
 * calibrated. Judging it on one neighbourhood tells you nothing.
 */

import { geocode } from '../lib/geo.js';
import { scoreListing } from '../lib/scoring.js';
import { writeReview } from '../lib/review.js';
import { apiKey, KEY_HELP, PROMPT_VERSION } from '../lib/config.js';

const CALIBRATION = [
  { address: '619 Oak St', note: 'Hayes Valley: walkable to everything' },
  { address: '425 1st St', note: 'Rincon Hill: perfect transit, poor safety' },
  { address: '1 Polk St', note: 'Edge of the Tenderloin: the worst-case control' },
  { address: '2095 20th Ave', note: 'Outer Sunset: quiet and far' },
  { address: '300 Connecticut St', note: 'Potrero Hill: quiet, hilly' },
];

// Per language, because the bounds are calibrated separately and are not translations of
// each other. Kept in step with the rules in prompts/review.js.
const TARGET = { en: { min: 110, max: 135, total: 400 }, zh: { min: 55, max: 65, total: 200 } };

// Opus 5 list price, for a rough per-review cost readout.
const USD_PER_INPUT_TOKEN = 5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 25 / 1_000_000;

const bar = (n) => (n == null ? '   –' : String(n).padStart(3) + ' ' + '█'.repeat(Math.round(n / 10)));

async function one({ address, note }, i, total, lang) {
  process.stdout.write(`\n[${i + 1}/${total}] ${address}${note ? `  (${note})` : ''}\n`);

  const g = await geocode(address);
  if (!g) { console.log('  could not locate, skipping'); return null; }

  const listing = {
    source: 'manual', address: g.matched || address, city: 'San Francisco',
    zip: g.zip || null, neighborhood: null, lat: g.lat, lng: g.lng,
    // A representative unit, so the price line in the brief is exercised too.
    unit_type: '1b1b', beds: 1, baths: 1, sqft: 650, price: 3200, monthly_fees: 0,
  };

  const scored = await scoreListing(listing);
  console.log(`  safety      ${bar(scored.safety)}`);
  console.log(`  convenience ${bar(scored.convenience)}`);
  console.log(`  price       ${bar(scored.price_score)}`);

  const t0 = Date.now();
  let review;
  try {
    review = await writeReview(listing, scored.breakdown, lang);
  } catch (err) {
    console.log(`  failed: ${err.message}`);
    return null;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const u = review.usage || {};
  const cost = (u.input_tokens || 0) * USD_PER_INPUT_TOKEN + (u.output_tokens || 0) * USD_PER_OUTPUT_TOKEN;

  // Per line, because that is the unit the prompt constrains. A total inside the budget
  // can still hide one line at half the floor and another well over the ceiling.
  const target = TARGET[lang];
  const lines = review.text.split(/\r?\n/).filter((l) => l.trim());
  const lens = lines.map((l) => l.length);
  const flag = (n) => (n < target.min ? '  under' : n > target.max ? '  OVER' : '');
  console.log();
  lines.forEach((l, k) => {
    for (const w of wrap(l, 74)) console.log('  | ' + w);
    console.log(`  |   ${lens[k]} chars${flag(lens[k])}`);
  });
  const dashes = (review.text.match(/[—–]/g) || []).length;
  if (dashes) console.log(`  !! ${dashes} en/em dash(es) in the output`);
  // Not `total`: that is the parameter holding how many addresses are in this run.
  const sum = lens.reduce((a, b) => a + b, 0);
  console.log(`  sum ${sum}/${target.total} - ${secs}s - in ${u.input_tokens} / out ${u.output_tokens} - $${cost.toFixed(4)}`);

  return { chars: sum, lens, cost, secs: +secs, lineCount: lines.length, dashes };
}

function wrap(text, width) {
  // CJK is roughly double-width, so wrap on visual columns rather than characters.
  const out = [];
  let line = '', cols = 0;
  for (const ch of text) {
    const w = /[　-鿿＀-｠]/.test(ch) ? 2 : 1;
    if (cols + w > width) { out.push(line); line = ''; cols = 0; }
    line += ch; cols += w;
  }
  if (line) out.push(line);
  return out;
}

const main = async () => {
  if (!apiKey()) { console.error(`An API key is needed. ${KEY_HELP}`); process.exit(1); }

  let args = process.argv.slice(2);
  const li = args.indexOf('--lang');
  const lang = li >= 0 ? args[li + 1] : 'en';
  if (li >= 0) args = args.filter((_, i) => i !== li && i !== li + 1);
  const targets = args.length ? args.map((address) => ({ address, note: null })) : CALIBRATION;

  console.log(`Review dry run - prompt ${PROMPT_VERSION} - lang ${lang} - ${targets.length} addresses`);
  console.log('-'.repeat(68));

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const r = await one(targets[i], i, targets.length, lang);
    if (r) results.push(r);
  }

  if (results.length) {
    const target = TARGET[lang];
    const avg = (f) => (results.reduce((s, r) => s + f(r), 0) / results.length);
    const lens = results.flatMap((r) => r.lens).sort((a, b) => a - b);
    const under = lens.filter((n) => n < target.min).length;
    const over = lens.filter((n) => n > target.max).length;
    console.log('\n' + '-'.repeat(68));
    console.log(`avg ${Math.round(avg((r) => r.chars))} chars - ${avg((r) => r.secs).toFixed(1)}s - $${avg((r) => r.cost).toFixed(4)} each`);
    console.log(`${results.length} reviews cost $${results.reduce((s, r) => s + r.cost, 0).toFixed(3)}`);
    console.log(`line length ${lens[0]} to ${lens[lens.length - 1]} (target ${target.min}-${target.max}), spread ${lens[lens.length - 1] - lens[0]}`);
    console.log(`${under} under the floor, ${over} over the ceiling, of ${lens.length} lines`);
    const wrong = results.filter((r) => r.lineCount !== 3).length;
    if (wrong) console.log(`${wrong} reviews did not have exactly three lines`);
    const dashes = results.reduce((s, r) => s + r.dashes, 0);
    console.log(dashes ? `${dashes} en/em dashes to eliminate` : 'no en/em dashes');
  }
  console.log('\nEdit the prompt in server/lib/prompts/review.js, bump PROMPT_VERSION, and run again.');
};

main().catch((e) => { console.error('failed:', e.message); process.exit(1); });

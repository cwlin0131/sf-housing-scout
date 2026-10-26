import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_VERSION, apiKey, KEY_HELP } from './config.js';
import { settings } from './settings.js';
import { fail } from './errors.js';
import { SYSTEM, ask, buildBrief, pickLang } from './prompts/review.js';

/**
 * The one paragraph a person actually reads.
 *
 * The model never browses. It receives the numbers this tool already computed and its only
 * job is to turn them into the sentence a friend who lives here would say. That constraint
 * is what keeps it from inventing cafes and street names.
 */

const MODEL = 'claude-opus-5-5';

let client = null;
function anthropic() {
  const key = apiKey();
  if (!key) fail('ai.no_key', `The written note needs an API key. ${KEY_HELP}`);
  return (client ??= new Anthropic({ apiKey: key }));
}

export { buildBrief, pickLang };

export async function writeReview(listing, breakdown, rawLang) {
  const lang = pickLang(rawLang);
  const brief = buildBrief(listing, breakdown, lang, settings().budget);
  const res = await anthropic().messages.create({
    model: MODEL,
    // Opus 5.5 always thinks, and max_tokens caps thinking plus visible text
    // together. At 700 a review that reasoned a little longer ran out of budget
    // and stopped mid-sentence, with nothing in the response saying so. The
    // paragraph itself needs a few hundred tokens; the rest is headroom.
    max_tokens: 3000,
    // The judgement was already made by the scorer. This call only has to say it
    // well, so paying for deep reasoning buys nothing but latency. Effort is the
    // only thinking control on this model; thinking itself cannot be switched off.
    output_config: { effort: 'low' },
    system: SYSTEM[lang],
    messages: [{ role: 'user', content: `${brief}\n\n${ask(lang)}` }],
  });
  if (res.stop_reason === 'max_tokens') {
    fail('ai.truncated', 'The note was cut off by max_tokens; raise it in review.js.');
  }
  // Safety classifiers return HTTP 200 with stop_reason "refusal" and no content,
  // so reading content[0] unconditionally would fail on an empty array rather than
  // surfacing what actually happened.
  if (res.stop_reason === 'refusal') {
    fail('ai.refused', `The model declined to write this note (${res.stop_details?.category || 'uncategorised'}).`);
  }
  const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  return { text, lang, model: MODEL, prompt_version: PROMPT_VERSION, brief, usage: res.usage };
}

/** Runs one prompt over several addresses so wording changes can be compared side by side. */
export async function dryRun(listings, breakdowns, lang) {
  const out = [];
  for (let i = 0; i < listings.length; i++) {
    try {
      const r = await writeReview(listings[i], breakdowns[i], lang);
      // Per-line lengths, because the calibration is per line: a total that looks right
      // can still hide one line at 60 characters and another at 190.
      const lines = r.text.split('\n').filter((l) => l.trim());
      out.push({
        address: listings[i].address,
        text: r.text,
        chars: r.text.replace(/\n/g, '').length,
        lineChars: lines.map((l) => l.length),
        usage: r.usage,
      });
    } catch (err) {
      out.push({ address: listings[i].address, error: String(err.message || err) });
    }
  }
  return out;
}

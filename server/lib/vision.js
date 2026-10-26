import Anthropic from '@anthropic-ai/sdk';
import { fail } from './errors.js';
import { apiKey, KEY_HELP } from './config.js';

/**
 * Reads listing details out of screenshots.
 *
 * Accepts several images at once because a listing page rarely fits on one screen: price
 * at the top, square footage halfway down, lease terms at the bottom. All of them go into
 * a single request so the model can reconcile them into one unit rather than guessing per
 * image. Anything it cannot find comes back null, and the preview card makes the user
 * confirm before the record is saved.
 */

const MODEL = 'claude-opus-5-5';

let client = null;
function anthropic() {
  const key = apiKey();
  if (!key) fail('ai.no_key', `Screenshot reading needs an API key. ${KEY_HELP}`);
  return (client ??= new Anthropic({ apiKey: key }));
}

// Returned as structured output rather than through a forced tool call: Opus 5.5 rejects
// tool_choice "tool", and the call only ever existed to get JSON back. Structured output
// requires every object to be closed and every field listed in `required`, so absent
// values come back as null rather than missing.
const FIELDS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    address: { type: ['string', 'null'], description: 'Full street address including the number. Null if not visible; never guess it from a neighbourhood name' },
    unit: { type: ['string', 'null'], description: 'Unit or apartment number' },
    price: { type: ['number', 'null'], description: 'Monthly rent as a plain number. Take the lower bound of a range' },
    monthly_fees: { type: ['number', 'null'], description: 'Recurring monthly charges on top of rent (utilities, trash, HOA and so on)' },
    deposit: { type: ['number', 'null'] },
    beds: { type: ['number', 'null'], description: 'A studio is 0' },
    baths: { type: ['number', 'null'] },
    sqft: { type: ['number', 'null'] },
    lease_term: { type: ['string', 'null'] },
    pets: { type: ['string', 'null'] },
    parking: { type: ['string', 'null'] },
    laundry: { type: ['string', 'null'] },
    furnished: { type: ['boolean', 'null'] },
    available_from: { type: ['string', 'null'], description: 'YYYY-MM-DD, or "now"' },
    listed_days_ago: {
      type: ['number', 'null'],
      description: 'How long it has been up, in whole days. Zillow writes this as "5 days on Zillow", "Listed 3 days ago", "2 hours ago" (under a day is 0). Null if not shown; never derive it from the available-from date',
    },
    url: { type: ['string', 'null'], description: 'Fill in if the address bar is visible in a screenshot' },
    source_site: { type: ['string', 'null'], description: 'For example Zillow, Craigslist, Apartments.com' },
    low_confidence: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of fields you filled but could not read plainly',
    },
    unreadable: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of fields that appear but are hard to read, or that disagree between screenshots',
    },
  },
};
FIELDS.required = Object.keys(FIELDS.properties);

const SYSTEM = `You are reading structured fields off screenshots of a rental listing. The user pastes several images at once; they are different parts of the same listing scrolled down, not different listings.

Rules:
- Treat every image as a source for one listing and merge them into a single record.
- Fill in only what you can actually see. Null otherwise. Never infer, and never fill a gap with what is usually true.
- If a price is a range, for example $3,200 to $3,800, take the lower bound.
- A studio has beds 0.
- When two images disagree on a field, take the clearer one and put the field name in unreadable.
- List in low_confidence every field you filled but could not read plainly.`;

export async function extractFromImages(images) {
  if (!images?.length) fail('listing.empty_input', 'Paste a Zillow link, an address, or a screenshot.');
  if (images.length > 8) fail('listing.too_many_images', 'Eight screenshots at most per listing.');

  const content = images.map((img, i) => ([
    { type: 'text', text: `Image ${i + 1} of ${images.length}:` },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
  ])).flat();

  content.push({ type: 'text', text: 'Merge these screenshots into one listing record.' });

  const res = await anthropic().messages.create({
    model: MODEL,
    // Thinking counts against max_tokens on this model, so this leaves room for it on top
    // of a record that is itself only a few hundred tokens.
    max_tokens: 8000,
    // Set explicitly: Opus 5.5 defaults to medium, and misreading a price is the one
    // mistake here that costs the user money, so it is not the place to save effort.
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: FIELDS },
    },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (res.stop_reason === 'refusal') {
    fail('ai.refused', `The model declined to read these screenshots (${res.stop_details?.category || 'uncategorised'}).`);
  }
  if (res.stop_reason === 'max_tokens') {
    fail('ai.truncated', 'The screenshot reading was cut off by max_tokens; raise it in vision.js.');
  }
  const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  let f;
  try {
    f = JSON.parse(text);
  } catch {
    fail('ai.no_output', 'The model did not return a structured result.');
  }

  return {
    fields: f,
    // Surface everything the model was unsure about so the preview card can highlight it
    // instead of quietly saving a wrong price.
    needsReview: [...new Set([...(f.unreadable || []), ...(f.low_confidence || [])])],
    usage: res.usage,
  };
}

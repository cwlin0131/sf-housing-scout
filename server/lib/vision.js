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

const MODEL = 'claude-opus-5';

let client = null;
function anthropic() {
  const key = apiKey();
  if (!key) fail('ai.no_key', `Screenshot reading needs an API key. ${KEY_HELP}`);
  return (client ??= new Anthropic({ apiKey: key }));
}

const SCHEMA = {
  name: 'listing_fields',
  description: 'Fields read off a rental listing screenshot',
  input_schema: {
    type: 'object',
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
      confidence: {
        type: 'object',
        description: 'Mark every field you filled as high or low. High means it was plainly legible',
        additionalProperties: { type: 'string', enum: ['high', 'low'] },
      },
      unreadable: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of fields that appear but are hard to read, or that disagree between screenshots',
      },
    },
    required: ['address', 'price', 'beds', 'confidence', 'unreadable'],
  },
};

const SYSTEM = `You are reading structured fields off screenshots of a rental listing. The user pastes several images at once; they are different parts of the same listing scrolled down, not different listings.

Rules:
- Treat every image as a source for one listing and merge them into a single record.
- Fill in only what you can actually see. Null otherwise. Never infer, and never fill a gap with what is usually true.
- If a price is a range, for example $3,200 to $3,800, take the lower bound.
- A studio has beds 0.
- When two images disagree on a field, take the clearer one and put the field name in unreadable.
- Every field you filled needs a high or low entry in confidence.`;

export async function extractFromImages(images) {
  if (!images?.length) throw new Error('No images were received.');
  if (images.length > 8) throw new Error('Eight images at most per listing.');

  const content = images.map((img, i) => ([
    { type: 'text', text: `Image ${i + 1} of ${images.length}:` },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
  ])).flat();

  content.push({
    type: 'text',
    text: 'Merge these screenshots into one listing record and return it by calling the listing_fields tool.',
  });

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    tools: [SCHEMA],
    tool_choice: { type: 'tool', name: 'listing_fields' },
    messages: [{ role: 'user', content }],
  });

  if (res.stop_reason === 'refusal') {
    fail('ai.refused', `The model declined to read these screenshots (${res.stop_details?.category || 'uncategorised'}).`);
  }
  const call = res.content.find((c) => c.type === 'tool_use');
  if (!call) fail('ai.no_output', 'The model did not return a structured result.');

  const f = call.input;
  return {
    fields: f,
    // Surface everything the model was unsure about so the preview card can highlight it
    // instead of quietly saving a wrong price.
    needsReview: [
      ...(f.unreadable || []),
      ...Object.entries(f.confidence || {}).filter(([, v]) => v === 'low').map(([k]) => k),
    ].filter((v, i, a) => a.indexOf(v) === i),
    usage: res.usage,
  };
}

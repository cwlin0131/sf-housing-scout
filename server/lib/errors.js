/**
 * Failures the user is meant to read.
 *
 * The API is consumed by a UI that ships in more than one language, so what crosses the
 * wire is a stable `code` and the interface translates it. The English `message` travels
 * alongside for logs and for anyone reading the raw response; it is a fallback, never the
 * thing the UI is expected to render.
 *
 * `meta` carries the parts that vary, an address or a field name, so a translation can
 * interpolate them instead of every variant needing its own code.
 */
export class AppError extends Error {
  constructor(code, message, meta) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

export const fail = (code, message, meta) => {
  throw new AppError(code, message, meta);
};

/**
 * Every code the server can return, with the English text.
 *
 * Kept in one list rather than scattered across throw sites so the translation files have
 * something to be checked against: a code here with no entry in a locale file is a visible
 * gap, whereas an inline string is simply missed.
 */
export const CODES = {
  'listing.url_not_supported': 'Only Zillow links are read automatically. Paste a screenshot for anything else.',
  'listing.zillow_only': 'That is not a Zillow URL.',
  'listing.unreadable': 'Could not read that page as a listing. Use a screenshot instead.',
  'listing.no_address_in_images': 'No full address visible in those screenshots. Add one showing it, or type the address.',
  'listing.geocode_failed': 'Could not find that address in San Francisco.',
  'listing.located_but_ungeocodable': 'Read the listing but could not place its address on the map.',
  'listing.empty_input': 'Paste a Zillow link, an address, or a screenshot.',
  'listing.bad_image': 'Image {index} is not in a format we can read.',
  'listing.too_many_images': 'Eight screenshots at most per listing.',
  'listing.not_found': 'No such listing.',
  'listing.bad_status': 'Unknown status: {status}.',
  'candidate.expired': 'That preview has expired. Paste it again.',

  'anchor.name_required': 'Give the place a name.',
  'anchor.location_required': 'Give the place an address or coordinates.',
  'anchor.geocode_failed': 'Could not find that address in San Francisco.',
  'anchor.nothing_to_update': 'Nothing to change.',

  'settings.not_a_number': '{path} has to be a number.',
  'settings.out_of_range': '{path} has to be between {min} and {max}.',
  'settings.ideal_above_max': 'The sweet spot cannot be higher than the reference line.',
  'settings.weights_both_zero': 'The two weights cannot both be zero.',
  'settings.not_a_boolean': '{path} has to be true or false.',
  'settings.home_geocode_failed': 'Could not find that address in San Francisco.',
  'settings.home_invalid': 'The core address needs both an address and a location.',
  'settings.avoid_invalid': 'Each avoided area needs a name and a cap between 0 and 100.',

  'ai.no_key': 'This needs an Anthropic API key. Screenshot reading and the written note are off without one; everything else works.',
  'ai.refused': 'The model declined to answer.',
  'ai.truncated': 'The model ran out of room before finishing.',
  'ai.no_output': 'The model returned nothing usable.',

  'fetch.chrome_missing': 'Could not find Chrome. Set CHROME_PATH in .env to the Chrome program on this computer.',
  'fetch.blocked': 'Zillow is showing a challenge. Solve it in the Chrome window that opened.',
};

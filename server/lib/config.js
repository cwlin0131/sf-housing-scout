// User-tunable settings. Everything the rubric reads lives here so scores stay explainable.
// Bump RUBRIC_VERSION whenever a weight or threshold changes: stored scores record the version
// they were computed under, so a list built over months stays comparable.

// 1.1.0: walking time to your pins uses street distance (COMMUTE.streetFactor), not a
// straight line, so convenience scores for the same address come out a little lower.
export const RUBRIC_VERSION = '1.1.0';
export const PROMPT_VERSION = '3.0.0';

/**
 * Areas you have walked and formed your own view on.
 *
 * A listing inside one has its safety score capped, and the card says so rather than
 * quietly lowering the number. Lived experience beats a statistic, but only your own:
 * this ships empty and is edited in the settings panel, because someone else's
 * no-go list is just a prejudice you have not checked.
 */
export const DEFAULT_AVOID = [];

/**
 * Defaults for everything the user can change at runtime. Actual values come from
 * settings.js, which layers whatever is stored in the database on top of these.
 *
 * Price deliberately does not feed the rating. Safety and convenience are the two
 * things the tool can measure better than a person skimming a listing; what a given
 * rent is worth is a judgement the user makes, and folding it into a score would
 * only hide that judgement behind a number.
 */
export const DEFAULT_SETTINGS = {
  budget: {
    // A reference line, not a scoring input. Listings above it are marked, not penalised.
    max: 4000,
    // Below this, price stops earning extra credit on the informational price figure.
    ideal: 2600,
    currency: 'USD',
  },
  // Areas you have ruled out yourself. See DEFAULT_AVOID for why this ships empty.
  avoid: DEFAULT_AVOID,
  // Off by default: safety and convenience are negatively correlated across the city
  // (measured at r = -0.32 over a sample of blocks), so averaging them compresses the
  // range and can rank a busy, unsafe block above a quiet one. Switch it on only if a
  // single sortable number is worth that. Weights apply when it is.
  composite: {
    enabled: false,
    safety: 0.55,
    convenience: 0.45,
  },
  // The one place you go most, usually work. Every listing shows the trip there.
  // Empty by default for the same reason anchors are: a shipped default would time
  // everyone's commute to a stranger's office.
  home: { label: '', address: '', lat: null, lng: null },
};

/**
 * Commute estimate to the core address. Not part of any score; see commute.js.
 * Speeds are door-to-door averages including stops, not top speed.
 */
export const COMMUTE = {
  // Straight lines understate street distance. 1.3 is typical for a grid with hills.
  // Also used for walking time to your pins in the convenience score, so the two agree.
  streetFactor: 1.3,
  railFactor: 1.1,
  speedKmh: { bart: 40, muni: 20 },
  // Half a typical headway.
  waitMinutes: 5,
  transferMinutes: 5,
  transferMetres: 200,
  // How far anyone walks to a stop before taking something else.
  maxStopWalkMetres: 1200,
  goodMinutes: 20,
  okMinutes: 35,
};

// No car. Parking contributes nothing and transit carries the weight it would have had.
export const LIFESTYLE = {
  hasCar: false,
  // Walking speed used to turn metres into minutes. 80 m/min is a normal city pace;
  // SF hills are handled separately by the terrain penalty, not by slowing this down.
  walkMetresPerMinute: 80,
};

/**
 * Places you go often, which "convenience" is measured against.
 *
 * Empty by default, and deliberately so: an anchor is the single most personal input in
 * the whole rubric, and a shipped default would quietly score everyone against a stranger's
 * commute. Add your own on the map, or the anchors term drops out and its weight is shared
 * by the components that were measured.
 */
export const DEFAULT_ANCHORS = [];

export const SAFETY = {
  // Radii in metres. Personal-safety incidents reach further because a robbery two blocks
  // away still shapes the walk home; street conditions are tight because they are about
  // the specific block you stand on.
  radius: { personal: 400, property: 250, street: 200 },
  months: { personal: 12, property: 12, street: 6 },
  weights: { personal: 0.45, property: 0.30, street: 0.20, trend: 0.05 },
  // Incidents between these hours count 1.5x. This is when you are walking home alone,
  // and a daytime commercial-district theft is not the same risk.
  night: { fromHour: 18, toHour: 6, multiplier: 1.5 },
  // Exponential distance decay: weight = exp(-d / decayMetres).
  decayMetres: 150,

  // Only these categories feed the personal-safety term. Deliberately excludes drug
  // offences: SF drug counts track enforcement intensity, not danger, and folding them in
  // would score "the police are active here" as "this is dangerous".
  personalCategories: [
    'Assault', 'Robbery', 'Weapons Offense', 'Weapons Offence',
    'Weapons Carrying Etc', 'Sex Offense', 'Homicide', 'Rape',
  ],
  propertyCategories: [
    'Burglary', 'Motor Vehicle Theft', 'Motor Vehicle Theft?',
    'Larceny Theft', 'Arson', 'Malicious Mischief', 'Vandalism',
  ],
  // 311 service_details values that describe how a block actually feels underfoot.
  streetDetails: ['human_waste_or_urine', 'needles_less_than_20'],

  /**
   * Load-to-score curve, anchored on places rather than on a percentile.
   *
   * The earlier version ranked each address against every other address in the city. That
   * sounds neutral but is not, because incident load is long-tailed while addresses are
   * not: most San Francisco addresses sit in quiet outer residential streets, so the
   * reference distribution is dense at low loads and almost empty along the downtown tail.
   * The rank therefore spent its resolution where the differences were trivial (Noe Valley
   * to Pacific Heights is a 2.2x load difference and moved the score 23 points) and had
   * none left where they were enormous (the Tenderloin to Hayes Valley is 4.3x and moved
   * it 4 points). Dense mixed-use blocks landed at the bottom by construction.
   *
   * These anchors map load to score directly, so a score means the same thing every time
   * it is computed and does not shift when other addresses are added. Interpolation runs
   * in log10 space because load spans roughly two orders of magnitude. Retuning is a
   * matter of editing this table: the named places are what each row was calibrated on.
   */
  scale: [
    { load: 400, score: 5 },    // worse than anywhere measured
    { load: 200, score: 25 },   // 16th & Mission
    { load: 100, score: 40 },   // Civic Center
    { load: 45, score: 55 },    // SoMa by the freeway
    { load: 20, score: 67 },    // Rincon Hill
    { load: 9, score: 78 },     // Noe Valley
    { load: 4, score: 89 },     // Pacific Heights
    { load: 1.5, score: 96 },
    { load: 0, score: 100 },
  ],
};

export const CONVENIENCE = {
  weights: { anchors: 0.40, transit: 0.25, amenities: 0.20, walkscore: 0.10, terrain: 0.05 },
  // Amenity search radius. 800 m is about a 10 minute walk.
  amenityRadius: 800,
  // Counts at or above these are treated as "plenty"; the score saturates there so a
  // neighbourhood with 40 cafes does not out-rank one with 12 on cafes alone.
  amenityTargets: { supermarket: 3, cafe: 8, gym: 2, pharmacy: 2, restaurant: 15, laundry: 1 },
  transit: { greatMetres: 400, okMetres: 900 },
};


/**
 * The API key, or null when there isn't a usable one.
 *
 * Checks the shape rather than mere presence: a `.env` left with its placeholder
 * would otherwise count as configured, and the failure would surface much later
 * as a bare 401 from the API instead of a message saying what to fix.
 */
export function apiKey() {
  const raw = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!raw.startsWith('sk-ant-') || raw.length < 24 || raw.includes('...')) return null;
  return raw;
}

// Worth spelling out: a Claude subscription is not API credit. They are separate products
// with separate billing, and the Console needs its own balance.
export const KEY_HELP =
  'Copy .env.example to .env and set ANTHROPIC_API_KEY, then restart. '
  + 'Get a key from console.anthropic.com under Settings, API keys. '
  + 'Note that a Claude subscription is not the same thing: the Console is billed separately.';

export const DATA = {
  sfIncidents: 'https://data.sf.gov/resource/wg3w-h783.json',
  sf311: 'https://data.sf.gov/resource/vw6y-z8j6.json',
  sfDispatch: 'https://data.sf.gov/resource/2zdj-bwza.json',
  sfAddresses: 'https://data.sf.gov/resource/ramy-di5m.json',
  overpass: 'https://overpass-api.de/api/interpreter',
};

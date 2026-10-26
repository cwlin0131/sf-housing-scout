import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where your own data lives, kept apart from the code.
 *
 * `data/` in the repo holds reference files that ship with the tool (rail lines, area
 * reads). Everything that is yours goes here instead: the database with your listings,
 * pins and settings, and the browser profile used for Zillow. Set SF_HOUSING_DATA in
 * .env to keep it outside the repo entirely, so updating or re-cloning the code never
 * touches it. Without it, `local/` in the repo is used, which git ignores.
 */
export const USER_DIR = resolve(process.env.SF_HOUSING_DATA || resolve(process.cwd(), 'local'));
mkdirSync(USER_DIR, { recursive: true });

export const DB_PATH = resolve(USER_DIR, 'sf-housing.db');
export const CHROME_PROFILE = resolve(USER_DIR, 'chrome-profile');

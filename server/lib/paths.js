import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repo root, worked out from this file rather than from the working directory.
 *
 * Resolving against process.cwd() meant starting the server from any other folder
 * (`node sf-housing-scout/server/index.js`, a launcher, a service) quietly created a new,
 * empty database there and lost the rail network, so every score came out different with
 * nothing saying why.
 */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = resolve(ROOT, 'data');
export const DIST_DIR = resolve(ROOT, 'dist');

/**
 * Where your own data lives, kept apart from the code.
 *
 * `data/` in the repo holds reference files that ship with the tool (rail lines, area
 * reads). Everything that is yours goes here instead: the database with your listings,
 * pins and settings, and the browser profile used for Zillow. Set SF_HOUSING_DATA in
 * .env to keep it outside the repo entirely, so updating or re-cloning the code never
 * touches it. Without it, `local/` in the repo is used, which git ignores.
 */
export const USER_DIR = resolve(process.env.SF_HOUSING_DATA || resolve(ROOT, 'local'));
mkdirSync(USER_DIR, { recursive: true });

export const DB_PATH = resolve(USER_DIR, 'sf-housing.db');
export const CHROME_PROFILE = resolve(USER_DIR, 'chrome-profile');

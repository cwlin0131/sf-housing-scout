import { useSyncExternalStore } from 'react';
import en from './en.json';
import zh from './zh.json';

/**
 * Translation, without a library.
 *
 * There are a few hundred strings and no plural rules worth the name, so i18next would be
 * more dependency than the problem deserves. What this needs is a lookup, `{name}`
 * interpolation, and a way to re-render when the language changes.
 *
 * English is the default rather than the browser's language: the tool is about San
 * Francisco, its data sources publish in English, and place names are never translated.
 * A stored choice always wins over the guess.
 */

const BUNDLES = { en, zh };
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '繁體中文' },
];

const STORAGE_KEY = 'sfhs.locale';

function initial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && BUNDLES[stored]) return stored;
  } catch { /* private mode, or storage disabled */ }
  return 'en';
}

let current = initial();
const listeners = new Set();

export const locale = () => current;

export function setLocale(next) {
  if (!BUNDLES[next] || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* not fatal */ }
  document.documentElement.lang = next === 'zh' ? 'zh-Hant' : 'en';
  listeners.forEach((f) => f());
}

/**
 * Look up a key, falling back to English and then to the key itself.
 *
 * Returning the key rather than an empty string is deliberate: a missing translation then
 * shows up as `list.empty` in the interface, which is obviously a bug, instead of as blank
 * space, which looks like an intentionally empty panel.
 */
export function t(key, vars) {
  const s = BUNDLES[current]?.[key] ?? en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

/** Translate a server error, which arrives as a code plus an English fallback. */
export function tError(err) {
  if (!err) return '';
  const code = typeof err === 'string' ? null : err.code;
  const key = code ? `err.${code}` : null;
  if (key && (BUNDLES[current]?.[key] ?? en[key])) return t(key, err.meta);
  return (typeof err === 'string' ? err : err.message) || t('err.unknown');
}

const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

/**
 * Subscribing anywhere in the tree re-renders that subtree on a language change. App
 * subscribes at the root, and since none of the panels are memoised that is enough to
 * refresh every `t()` call below it.
 */
export function useLocale() {
  const code = useSyncExternalStore(subscribe, locale, locale);
  return [code, setLocale];
}

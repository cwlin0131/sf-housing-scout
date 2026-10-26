import { spawn } from 'node:child_process';
import { fail } from './errors.js';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Drives one long-lived, visible Chrome over the DevTools Protocol.
 *
 * Zillow sits behind PerimeterX and blocks rapid sequential loads, so requests are
 * serialised with a randomised gap and the browser is warmed on the site's own home page
 * after a long idle. When a challenge does appear the queue stops and waits: the window is
 * visible on purpose, so the user presses the button themselves and hits resume. There is
 * no captcha service and no attempt to look like anything other than a person's browser.
 */

const PORT = 9333;
const PROFILE = resolve(process.cwd(), 'data/chrome-profile');
const MIN_GAP_MS = 25_000;
const MAX_GAP_MS = 45_000;
const WARM_AFTER_MS = 20 * 60_000;
const NAV_SETTLE_MS = 11_000;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);

export const state = {
  status: 'idle',      // idle | warming | fetching | waiting | blocked | error
  // Two kinds of progress text. `messageCode` is a key the interface translates;
  // `message` is free text that never needs translating, such as the URL being fetched.
  messageCode: null,
  messageMeta: null,
  message: '',
  queued: 0,
  lastRequestAt: 0,
  blockedUrl: null,
};

/** Clear both, so a stale code never outlives the step that set it. */
function clearMessage() {
  state.messageCode = null;
  state.messageMeta = null;
  state.message = '';
}

let chromeProc = null;
let chain = Promise.resolve();

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) fail('fetch.chrome_missing', 'Could not find Chrome. Set CHROME_PATH to your chrome executable.');
  return hit;
}

async function devtoolsUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureChrome() {
  if (await devtoolsUp()) return;
  mkdirSync(PROFILE, { recursive: true });
  chromeProc = spawn(
    findChrome(),
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,940',
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' }
  );
  for (let i = 0; i < 25; i++) {
    await sleep(700);
    if (await devtoolsUp()) return;
  }
  throw new Error('Chrome started but DevTools never answered.');
}

/** Minimal CDP session over the page target. No dependency, node's built-in WebSocket. */
async function withPage(fn) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let target = targets.find((t) => t.type === 'page');
  if (!target) {
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('CDP connection failed')));
  });

  const send = (method, params = {}) => {
    const myId = ++id;
    return new Promise((res) => {
      pending.set(myId, res);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error('Page evaluation failed: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200));
    }
    return r.result?.result?.value;
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    return await fn({ send, evaluate });
  } finally {
    ws.close();
  }
}

const BLOCK_RE = /access to this page has been denied|press.{0,4}hold|按壓|確認您是人類|are you a human|verify you are/i;

async function navigate(page, url, settleMs = NAV_SETTLE_MS) {
  await page.send('Page.navigate', { url });
  await sleep(settleMs);
  const probe = await page.evaluate(
    `JSON.stringify({
      title: document.title,
      url: location.href,
      text: (document.body ? document.body.innerText : '').slice(0, 300),
      hasNextData: !!document.querySelector('#__NEXT_DATA__')
    })`
  );
  return JSON.parse(probe || '{}');
}

/** Public: enqueue a paced page load and return the parsed __NEXT_DATA__ payload. */
export function fetchZillow(url) {
  state.queued += 1;
  const job = chain.then(async () => {
    try {
      return await runOne(url);
    } finally {
      state.queued -= 1;
    }
  });
  // Keep the chain alive even when a job rejects, so one failure does not wedge the queue.
  chain = job.catch(() => {});
  return job;
}

async function runOne(url) {
  await ensureChrome();

  const since = Date.now() - state.lastRequestAt;
  const gap = jitter();
  if (state.lastRequestAt && since < gap) {
    state.status = 'waiting';
    state.messageCode = 'pacing';
    state.messageMeta = { seconds: Math.ceil((gap - since) / 1000) };
    await sleep(gap - since);
  }

  return withPage(async (page) => {
    if (!state.lastRequestAt || Date.now() - state.lastRequestAt > WARM_AFTER_MS) {
      state.status = 'warming';
      state.messageCode = 'warming';
      state.messageMeta = null;
      await navigate(page, 'https://www.zillow.com/', 6000);
      await sleep(8000);
    }

    state.status = 'fetching';
    clearMessage();
    state.message = url;
    state.lastRequestAt = Date.now();

    let probe = await navigate(page, url);
    if (BLOCK_RE.test(probe.title + probe.text)) {
      state.status = 'blocked';
      state.blockedUrl = url;
      state.messageCode = 'challenge';
      state.messageMeta = null;
      await waitForUnblock();
      state.lastRequestAt = Date.now();
      probe = await navigate(page, url);
      if (BLOCK_RE.test(probe.title + probe.text)) {
        state.status = 'error';
        state.messageCode = 'still_blocked';
      state.messageMeta = null;
        throw new Error('BLOCKED');
      }
    }

    if (!probe.hasNextData) {
      state.status = 'error';
      state.messageCode = 'no_data_shape';
      state.messageMeta = null;
      throw new Error('NO_DATA');
    }

    const raw = await page.evaluate(`document.querySelector('#__NEXT_DATA__').textContent`);
    state.status = 'idle';
    clearMessage();
    return { url: probe.url, nextData: JSON.parse(raw) };
  });
}

let unblockResolve = null;
/**
 * Park the queue until the user clears the challenge in the visible window. Capped so a
 * request cannot hang forever if they walked away; the UI shows the prompt either way.
 */
function waitForUnblock(timeoutMs = 4 * 60_000) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      unblockResolve = null;
      state.status = 'idle';
      state.blockedUrl = null;
      clearMessage();
      rej(new Error('Waited too long for the challenge. Solve it and paste again, or use a screenshot.'));
    }, timeoutMs);
    unblockResolve = () => { clearTimeout(timer); res(); };
  });
}

/** Called by the UI once the user has cleared the challenge in the visible window. */
export function markUnblocked() {
  if (!unblockResolve) return false;
  unblockResolve();
  unblockResolve = null;
  state.status = 'fetching';
  state.blockedUrl = null;
  clearMessage();
  return true;
}

export function shutdown() {
  try { chromeProc?.kill(); } catch { /* already gone */ }
}

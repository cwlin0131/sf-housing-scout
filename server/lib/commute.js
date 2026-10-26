import { distanceMetres, walkMinutes, loadStops } from './geo.js';
import { settings } from './settings.js';
import { COMMUTE, LIFESTYLE } from './config.js';

/**
 * Door-to-door time from a listing to the user's core address.
 *
 * An estimate, and the interface says so. It knows walking and the rail network that is
 * already on the map (BART and Muni Metro), not buses, so in a part of town served mainly
 * by a bus it reads long. The card links out to a real trip planner for that reason.
 *
 * Worked out each time a listing is read rather than stored with its score, so changing
 * the core address updates every listing at once and never leaves a stale number behind.
 * It does not feed the convenience score: that would change what every stored score means.
 */
export function commuteFor(lat, lng) {
  const home = settings().home;
  if (!home || home.lat == null || home.lng == null || lat == null || lng == null) return null;

  const walkM = Math.round(distanceMetres(lat, lng, home.lat, home.lng) * COMMUTE.streetFactor);
  const walk = { minutes: Math.round(walkMinutes(walkM)), metres: walkM };
  const transit = bestRail(lat, lng, home.lat, home.lng);

  const best = transit && transit.minutes < walk.minutes ? 'transit' : 'walk';
  const minutes = best === 'transit' ? transit.minutes : walk.minutes;
  return {
    to: home.label || home.address,
    address: home.address,
    minutes,
    best,
    walk,
    transit,
    tone: minutes <= COMMUTE.goodMinutes ? 'good' : minutes <= COMMUTE.okMinutes ? 'warn' : 'bad',
  };
}

// BART shares one alignment inside the city, so its colours are one line for routing.
const lineKey = (stop, line) => (stop.mode === 'bart' ? 'bart' : `muni:${line}`);
const linesOf = (stop) => (stop.mode === 'bart' ? ['bart'] : stop.lines.map((l) => lineKey(stop, l)));
const speedOf = (key) => (key === 'bart' ? COMMUTE.speedKmh.bart : COMMUTE.speedKmh.muni);

function rideMinutes(a, b, key) {
  const km = (distanceMetres(a.lat, a.lng, b.lat, b.lng) * COMMUTE.railFactor) / 1000;
  return (km / speedOf(key)) * 60;
}

const walkTo = (lat, lng, s) =>
  walkMinutes(distanceMetres(lat, lng, s.lat, s.lng) * COMMUTE.streetFactor);

/** Pairs of stops where one line can be changed for another, worked out once. */
let transferCache = null;
function transferPoints() {
  if (transferCache) return transferCache;
  const stops = loadStops();
  transferCache = new Map();
  for (const x of stops) {
    for (const y of stops) {
      if (distanceMetres(x.lat, x.lng, y.lat, y.lng) > COMMUTE.transferMetres) continue;
      for (const ka of linesOf(x)) for (const kb of linesOf(y)) {
        if (ka === kb) continue;
        const key = `${ka}|${kb}`;
        if (!transferCache.has(key)) transferCache.set(key, []);
        transferCache.get(key).push([x, y]);
      }
    }
  }
  return transferCache;
}

/** Stops within walking reach, each with the minutes it takes to get there. */
function reachable(lat, lng) {
  return loadStops()
    .map((s) => ({ ...s, walk: walkTo(lat, lng, s) }))
    .filter((s) => s.walk * LIFESTYLE.walkMetresPerMinute <= COMMUTE.maxStopWalkMetres || s.walk <= 3);
}

/**
 * Cheapest rail trip with at most one change. Waiting is half a typical headway, and a
 * change adds a fixed penalty, because the stop-to-stop ride is the smallest part of
 * most San Francisco trips and the waiting is what people actually remember.
 */
function bestRail(oLat, oLng, dLat, dLng) {
  const from = reachable(oLat, oLng);
  const to = reachable(dLat, dLng);
  if (!from.length || !to.length) return null;

  let best = null;
  const consider = (minutes, legs) => {
    if (!best || minutes < best.minutes) best = { minutes, legs };
  };

  // Group destination stops by line so each origin stop checks only shared lines.
  const toByLine = new Map();
  for (const s of to) for (const k of linesOf(s)) {
    if (!toByLine.has(k)) toByLine.set(k, []);
    toByLine.get(k).push(s);
  }

  for (const o of from) {
    for (const k of linesOf(o)) {
      for (const d of toByLine.get(k) || []) {
        if (o.name === d.name) continue;
        const ride = rideMinutes(o, d, k);
        consider(o.walk + COMMUTE.waitMinutes + ride + d.walk, [
          { walk: o.walk, board: o.name, line: k, alight: d.name, ride, walkAfter: d.walk },
        ]);
      }
    }
  }

  // One change: an origin line and a destination line that meet at stops close together.
  const changes = transferPoints();
  for (const o of from) {
    for (const ka of linesOf(o)) {
      for (const [kb, dests] of toByLine) {
        if (kb === ka) continue;
        for (const [x, y] of changes.get(`${ka}|${kb}`) || []) {
          const first = rideMinutes(o, x, ka);
          for (const d of dests) {
            const second = rideMinutes(y, d, kb);
            const total = o.walk + COMMUTE.waitMinutes + first + COMMUTE.transferMinutes + second + d.walk;
            if (best && total >= best.minutes) continue;
            consider(total, [
              { walk: o.walk, board: o.name, line: ka, alight: x.name, ride: first },
              { board: y.name, line: kb, alight: d.name, ride: second, walkAfter: d.walk },
            ]);
          }
        }
      }
    }
  }

  if (!best) return null;
  return {
    minutes: Math.round(best.minutes),
    legs: best.legs.map((l) => ({
      ...l,
      line: l.line === 'bart' ? 'BART' : l.line.replace('muni:', ''),
      walk: l.walk == null ? undefined : Math.round(l.walk),
      ride: Math.round(l.ride),
      walkAfter: l.walkAfter == null ? undefined : Math.round(l.walkAfter),
    })),
  };
}

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TIER_COLORS, pick, tierLabel, money } from '../lib/api.js';
import { t } from '../i18n/index.js';

/**
 * The map is the primary surface: everything else is a panel beside it.
 *
 * Four layers, each independently toggleable, because they answer different questions:
 * the curated area shading (what is this part of town like), transit lines and stations
 * (can I get around), the user's own pins (is it near the places I go), and the listings
 * themselves.
 */

const SF = [37.7749, -122.4194];

export default function MapView({
  zones, places, transit, anchors, home, listings, activeId,
  layers, onSelect, onDropPin, pinMode, locale,
}) {
  const el = useRef(null);
  const map = useRef(null);
  const groups = useRef({});
  // One shared popup for the area layer, so clicking the same zone twice can close it.
  const zonePopup = useRef(null);
  const openZone = useRef(null);

  // Set up once. Leaflet owns this DOM node from here on.
  useEffect(() => {
    if (map.current) return;
    const m = L.map(el.current, { center: SF, zoom: 13, zoomControl: true, preferCanvas: true });
    // Browser-supplied User-Agent and Referer keep this inside the OSM tile usage policy.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: 'osm-tiles',
    }).addTo(m);

    groups.current = {
      zones: L.layerGroup().addTo(m),
      transit: L.layerGroup().addTo(m),
      anchors: L.layerGroup().addTo(m),
      listings: L.layerGroup().addTo(m),
    };
    zonePopup.current = L.popup({ maxWidth: 300 });
    m.on('popupclose', (e) => { if (e.popup === zonePopup.current) openZone.current = null; });
    map.current = m;
    // Tiles come from a light basemap; dim them so the data layers stay legible on dark.
    const style = document.createElement('style');
    style.textContent = '.osm-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.5) contrast(0.95); }';
    document.head.appendChild(style);
  }, []);

  // Clicking the map while in pin mode drops a user anchor there.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const handler = (e) => onDropPin?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    if (pinMode) {
      m.on('click', handler);
      m.getContainer().style.cursor = 'crosshair';
    }
    return () => {
      m.off('click', handler);
      m.getContainer().style.cursor = '';
    };
  }, [pinMode, onDropPin]);

  // Curated area shading. Deliberately coarse and translucent: it is a characterisation,
  // not a measurement, and should not look more precise than it is.
  useEffect(() => {
    const g = groups.current.zones;
    if (!g) return;
    g.clearLayers();
    if (!layers.zones) return;
    for (const z of zones) {
      const poly = L.polygon(z.polygon, {
        color: TIER_COLORS[z.tier] || '#888',
        weight: 1,
        opacity: 0.5,
        fillColor: TIER_COLORS[z.tier] || '#888',
        fillOpacity: 0.22,
      }).addTo(g);

      // Not bindPopup: that opens on every click and never closes, so clicking the same
      // area again just reopened it. One shared popup lets a second click on the same
      // zone dismiss it, while a click on a different zone moves it.
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const m = map.current;
        const p = zonePopup.current;
        if (!m || !p) return;
        if (openZone.current === z.id) { m.closePopup(p); openZone.current = null; return; }
        // Reading an area and having a listing open are two different questions, and only
        // one popup shows at a time anyway. Collapse the listing rather than let its
        // marker popup reclaim the map a moment later.
        onSelect?.(null);
        openZone.current = z.id;
        p.setLatLng(e.latlng).setContent(zoneHtml(z, placeName(places, e.latlng))).openOn(m);
      });
    }
  }, [zones, places, layers.zones, onSelect, locale]);

  useEffect(() => {
    const g = groups.current.transit;
    if (!g) return;
    g.clearLayers();
    if (!layers.transit || !transit) return;

    for (const f of transit.lines.features || []) {
      L.geoJSON(f, {
        style: { color: f.properties.color || '#4FB8AD', weight: f.properties.mode === 'bart' ? 4 : 2.5, opacity: 0.85 },
      })
        .bindPopup(`<b>${f.properties.name || f.properties.line}</b>`)
        .addTo(g);
    }
    for (const f of transit.stops.features || []) {
      const isBart = f.properties.mode === 'bart';
      const [lng, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lng], {
        radius: isBart ? 5 : 3,
        color: isBart ? '#0099CC' : '#8FA6A2',
        weight: isBart ? 2 : 1,
        fillColor: isBart ? '#0099CC' : '#3A4845',
        fillOpacity: 0.9,
      })
        .bindPopup(`<b>${f.properties.name}</b><br/>${isBart ? 'BART' : 'Muni Metro'} ${(f.properties.lines || []).join(' ')}`)
        .addTo(g);
    }
  }, [transit, layers.transit]);

  useEffect(() => {
    const g = groups.current.anchors;
    if (!g) return;
    g.clearLayers();
    if (!layers.anchors) return;
    if (home?.lat != null) {
      const name = home.label || t('map.home');
      L.marker([home.lat, home.lng], {
        icon: L.divIcon({ className: '', html: '<div class="home-pin">⌂</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      })
        .bindPopup(`<b>${name}</b><br/>${home.address}<br/><span style="opacity:.6">${t('map.home_hint')}</span>`)
        .addTo(g);
      L.marker([home.lat, home.lng], {
        icon: L.divIcon({ className: '', html: `<div class="pin-label">${name}</div>`, iconAnchor: [-12, 8] }),
        interactive: false,
      }).addTo(g);
    }
    for (const a of anchors.filter((x) => x.pinned)) {
      L.marker([a.lat, a.lng], { icon: flagIcon(a.scored) })
        .bindPopup(`<b>${a.name}</b>${a.note ? `<br/>${a.note}` : ''}<br/><span style="opacity:.6">${t(a.scored ? 'map.anchor_scored' : 'map.anchor_unscored')}</span>`)
        .addTo(g);
      L.marker([a.lat, a.lng], {
        icon: L.divIcon({ className: '', html: `<div class="pin-label">${a.name}</div>`, iconAnchor: [-8, 8] }),
        interactive: false,
      }).addTo(g);
    }
  }, [anchors, home, layers.anchors, locale]);

  useEffect(() => {
    const g = groups.current.listings;
    if (!g) return;
    g.clearLayers();
    // Delisted listings are kept in the database but are not drawn: they are history, and
    // a pin on the map reads as somewhere you could still go and see.
    for (const l of listings.filter((x) => x.status !== 'deactivated')) {
      const active = l.id === activeId;
      const marker = L.circleMarker([l.lat, l.lng], {
        radius: active ? 11 : 8,
        color: active ? '#4FB8AD' : '#0E1413',
        weight: active ? 3 : 1.5,
        fillColor: scoreColor(l.safety),
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<b>${l.address}</b><br/>`
          + `${money(l.price)}${l.unit_type ? ` · ${l.unit_type}` : ''}<br/>`
          + `<span style="opacity:.75">${t('list.safety')} ${l.safety ?? '–'}  ${t('list.convenience')} ${l.convenience ?? '–'}</span>`
        )
        .on('click', () => onSelect?.(l.id))
        .addTo(g);
      if (active) marker.openPopup();
    }
  }, [listings, activeId, onSelect, locale]);

  // Bring the selected listing into view without yanking the map on every render.
  useEffect(() => {
    const l = listings.find((x) => x.id === activeId);
    if (l && map.current) map.current.panTo([l.lat, l.lng], { animate: true });
  }, [activeId]);

  return <div id="map" ref={el} />;
}

/** Same thresholds as `tone()` in the panels, so a pin and its row never disagree. */
function scoreColor(safety) {
  if (safety == null) return '#74807C';
  if (safety >= 70) return '#6FBF87';
  if (safety >= 45) return '#D9974F';
  return '#D96C6C';
}

function flagIcon(scored) {
  const c = scored ? '#4FB8AD' : '#74807C';
  return L.divIcon({
    className: '',
    iconSize: [16, 20],
    iconAnchor: [2, 20],
    html: `<svg width="16" height="20" viewBox="0 0 16 20" xmlns="http://www.w3.org/2000/svg">
      <line x1="2" y1="1" x2="2" y2="20" stroke="${c}" stroke-width="2"/>
      <path d="M3 2 L14 5.5 L3 9 Z" fill="${c}" opacity="0.9"/>
    </svg>`,
  });
}

/** The clicked point's common neighbourhood name, smallest polygon wins. */
function placeName(places, latlng) {
  if (!places?.length) return null;
  let best = null;
  for (const p of places) {
    if (!pointInRing(latlng.lat, latlng.lng, p.polygon)) continue;
    const a = ringArea(p.polygon);
    if (!best || a < best.a) best = { name: p.name, a };
  }
  return best?.name ?? null;
}

function pointInRing(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(poly) {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += poly[j][1] * poly[i][0] - poly[i][1] * poly[j][0];
  }
  return Math.abs(sum / 2);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The common name leads, because that is the one a person recognises and searches for.
 * The tier and the written read belong to the coarser official area, so when the two
 * differ that is said outright rather than letting the summary look specific to the spot.
 */
function zoneHtml(z, place) {
  const differs = place && place !== z.name;
  return [
    `<b>${esc(place || z.name)}</b>`,
    `<div style="opacity:.7;font-size:.9em">${esc(tierLabel(z.tier))} (tier ${z.tier}/5)`,
    differs ? ` · ${esc(t('map.broader_area', { name: z.name }))}` : '',
    '</div>',
    differs ? `<div style="opacity:.55;font-size:.85em;margin-top:.25em">${esc(t('map.summary_scope', { name: z.name }))}</div>` : '',
    `<div style="margin-top:.35em">${esc(pick(z.summary) || '')}</div>`,
  ].join('');
}

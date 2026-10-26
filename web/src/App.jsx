import { useCallback, useEffect, useState } from 'react';
import { api, fetcherMessage, TIER_COLORS, tierLabel } from './lib/api.js';
import { t, useLocale, LOCALES } from './i18n/index.js';
import MapView from './components/MapView.jsx';
import AddBox from './components/AddBox.jsx';
import PreviewCard from './components/PreviewCard.jsx';
import ListPanel from './components/ListPanel.jsx';
import AnchorPanel from './components/AnchorPanel.jsx';
import DataView from './components/DataView.jsx';
import ListingDetail from './components/ListingDetail.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

export default function App() {
  const [tab, setTab] = useState('add');
  const [status, setStatus] = useState(null);
  const [zones, setZones] = useState([]);
  const [places, setPlaces] = useState([]);
  const [transit, setTransit] = useState(null);
  const [anchors, setAnchors] = useState([]);
  const [listings, setListings] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [pinMode, setPinMode] = useState(false);
  const [pendingPinName, setPendingPinName] = useState('');
  const [layers, setLayers] = useState({ zones: true, transit: true, anchors: true });
  const [settings, setSettings] = useState(null);
  // Subscribing here re-renders the whole tree on a language change. None of the panels
  // are memoised, so every t() call below refreshes with it.
  const [lang, setLang] = useLocale();

  const reloadListings = useCallback(async () => {
    const { listings } = await api.listings('saved');
    setListings(listings);
  }, []);

  const reloadAnchors = useCallback(async () => {
    const { anchors } = await api.anchors();
    setAnchors(anchors);
  }, []);

  useEffect(() => {
    (async () => {
      // Not `t`: that shadows the translation function for the rest of this closure.
      const [z, tr] = await Promise.all([api.zones().catch(() => ({ zones: [] })), api.transit().catch(() => null)]);
      setZones(z.zones || []);
      setPlaces(z.places || []);
      setTransit(tr ? { lines: tr.lines, stops: tr.stops } : null);
      await reloadAnchors();
      await reloadListings();
      const { settings } = await api.settings();
      setSettings(settings);
    })();
  }, [reloadAnchors, reloadListings]);

  // Poll the fetcher so the challenge prompt appears without the user hunting for it.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.status();
        if (alive) setStatus(s);
      } catch { /* server restarting during dev */ }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const score = async (payload) => {
    setBusy(true);
    setCandidate(null);
    try {
      const res = await api.score(payload);
      const { ok, ...cand } = res;
      setCandidate(cand);
      setTab('add');
    } finally {
      setBusy(false);
    }
  };

  const keep = async (token, edits) => {
    setBusy(true);
    try {
      const { listing } = await api.keep(token, { edits });
      setCandidate(null);
      await reloadListings();
      setActiveId(listing.id);
      setTab('list');
    } finally {
      setBusy(false);
    }
  };

  const drop = async (token) => {
    setBusy(true);
    try {
      await api.drop(token);
      setCandidate(null);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await api.refresh(10);
      setRefreshResult(res);
      await reloadListings();
    } catch (err) {
      setRefreshResult({ checked: 0, results: [], remaining: 0, error: String(err.message || err) });
    } finally {
      setRefreshing(false);
    }
  };

  const mark = async (id, marks) => {
    await api.mark(id, marks);
    await reloadListings();
  };

  const saveSettings = async (next) => {
    const res = await api.saveSettings(next);
    setSettings(res.settings);
    await reloadListings();
    return res;
  };

  // Stable identity: MapView rebuilds its marker layer whenever this changes, and an
  // inline arrow made that happen on every render, including the 2.5s status poll.
  const selectFromMap = useCallback((id) => {
    setActiveId(id);
    if (id != null) setTab('list');
  }, []);

  const dropPin = async ({ lat, lng }) => {
    const name = pendingPinName.trim() || window.prompt(t('app.pin_name_prompt'));
    if (!name) { setPinMode(false); return; }
    await api.addAnchor({ name, lat, lng, weight: 1 });
    await reloadAnchors();
    setPinMode(false);
    setPendingPinName('');
  };

  const f = status?.fetcher;
  const blocked = f?.status === 'blocked';

  return (
    <div className="app">
      <div className="map-pane">
        <MapView
          zones={zones}
          places={places}
          transit={transit}
          anchors={anchors}
          home={settings?.home}
          listings={listings}
          activeId={activeId}
          layers={layers}
          pinMode={pinMode}
          locale={lang}
          onSelect={selectFromMap}
          onDropPin={dropPin}
        />

        <div className="maptools">
          {[
            'zones', 'transit', 'anchors',
          ].map((k) => (
            <button key={k} data-on={layers[k]} onClick={() => setLayers((p) => ({ ...p, [k]: !p[k] }))}>
              {t(`app.layer.${k}`)}
            </button>
          ))}
        </div>

        {layers.zones && zones.length > 0 && (
          <div className="legend">
            <span className="t">{t('app.legend.title')}</span>
            {[5, 4, 3, 2, 1].map((tier) => (
              <span className="k" key={tier}>
                <span className="sw" style={{ background: TIER_COLORS[tier] }} />
                {tierLabel(tier)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="side">
        <div className="side-head">
          <div className="brand">
            <h1>SF Housing Scout</h1>
            <span>{t('app.rubric', { v: status?.config?.rubricVersion || '–' })}</span>
            <select
              className="langsel"
              value={lang}
              aria-label={t('app.language')}
              onChange={(e) => setLang(e.target.value)}
            >
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          <div className="status" data-s={f?.status || 'idle'}>
            <span className="dot" />
            <span className="msg">
              {blocked
                ? t('app.blocked')
                : fetcherMessage(f) || statusLabel(f?.status, status)}
            </span>
            {blocked && (
              <button
                className="primary"
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => api.unblock()}
              >
                {t('app.blocked_resolved')}
              </button>
            )}
          </div>

          <div className="tabs">
            {[
              'add', 'list', 'pins', 'data',
            ].map((k) => (
              <button key={k} data-on={tab === k} onClick={() => setTab(k)}>
                {t(`app.tab.${k}`)}
                {k === 'list' && listings.length ? ` ${listings.length}` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="side-body">
          {tab === 'add' && (
            <>
              <AddBox onScore={score} busy={busy} />
              {candidate && <PreviewCard candidate={candidate} onKeep={keep} onDrop={drop} busy={busy} homeSet={settings?.home?.lat != null} />}
              {!candidate && status && status.incidents === 0 && (
                <div className="infobox">
                  {t('app.no_crime_data')}
                </div>
              )}
            </>
          )}

          {tab === 'list' && (
            <>
              <ListPanel
                listings={listings}
                activeId={activeId}
                onSelect={setActiveId}
                onRefresh={refresh}
                refreshing={refreshing}
                refreshResult={refreshResult}
                onMark={mark}
                compositeOn={!!settings?.composite?.enabled}
                renderDetail={(l) => (
                  <ListingDetail
                    listing={l}
                    onDeactivate={async (id) => {
                      await api.patchListing(id, { status: 'deactivated', reason: 'manual' });
                      await reloadListings();
                    }}
                    onSaveNotes={async (id, notes) => {
                      await api.patchListing(id, { notes });
                      await reloadListings();
                    }}
                  />
                )}
              />
            </>
          )}

          {tab === 'pins' && (
            <>
              <input
                placeholder={t('app.pin_name_placeholder')}
                value={pendingPinName}
                onChange={(e) => setPendingPinName(e.target.value)}
                style={{ display: pinMode ? 'block' : 'none' }}
              />
              <AnchorPanel
                anchors={anchors}
                pinMode={pinMode}
                setPinMode={setPinMode}
                onAdd={async (body) => { await api.addAnchor(body); await reloadAnchors(); }}
                onUpdate={async (id, body) => { await api.updateAnchor(id, body); await reloadAnchors(); }}
                onDelete={async (id) => { await api.deleteAnchor(id); await reloadAnchors(); }}
              />
              <SettingsPanel settings={settings} onSave={saveSettings} areaNames={[...new Set([...places, ...zones].map((p) => p.name))].sort()} />
            </>
          )}

          {tab === 'data' && <DataView />}
        </div>
      </div>
    </div>
  );
}

function statusLabel(s, status) {
  if (s === 'idle' || !s) {
    const n = status?.incidents || 0;
    return n
      ? t('app.status.ready_with_data', { n: n.toLocaleString() })
      : t('app.status.ready_no_data');
  }
  return ['warming', 'fetching', 'waiting', 'error'].includes(s) ? t(`app.status.${s}`) : s;
}

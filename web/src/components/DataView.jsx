import { useEffect, useMemo, useState } from 'react';
import { api, pick, TIER_COLORS, tierLabel } from '../lib/api.js';
import { t } from '../i18n/index.js';

/**
 * The audit trail behind the map.
 *
 * The heat overlay is a characterisation and the star rating is a summary; both hide their
 * inputs by design. This view does the opposite: raw counts per area, per category, the
 * method choices that shaped them, and every source the curated tiers rest on. If a tier
 * looks wrong, this is where you go to argue with it.
 */
/** Zones cite sources by id; the readable label lives on the source itself. */
const sourceLabel = (sources, id) => pick((sources || []).find((x) => x.id === id)?.label) || id;

export default function DataView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('areas');
  const [sort, setSort] = useState('personal');

  useEffect(() => {
    api.crimeTable().then(setData).catch((e) => setErr(String(e.message || e)));
  }, []);

  const rows = useMemo(() => {
    if (!data?.neighborhoods) return [];
    return data.neighborhoods.slice().sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'tier') return (a.tier ?? 99) - (b.tier ?? 99);
      return (b[sort] || 0) - (a[sort] || 0);
    });
  }, [data, sort]);

  if (err) return <div className="warnbox"><b>{t('data.load_failed')}</b><span>{err}</span></div>;
  if (!data) return <div className="empty">{t('data.loading')}</div>;

  return (
    <>
      <div className="tabs">
        {['areas', 'cats', 'zones', 'method'].map((k) => (
          <button key={k} data-on={view === k} onClick={() => setView(k)}>
            {t(`data.view.${k}`)}
          </button>
        ))}
      </div>

      {!data.hasData && (
        <div className="infobox">
          {t(`data.${data.noteCode}`)}
        </div>
      )}

      {view === 'areas' && data.hasData && (
        <>
          <div className="listhead">
            <span style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>
              {t('data.local_count', { n: data.total.toLocaleString() })}
              {data.syncedAt && t('data.synced_at', { date: data.syncedAt.slice(0, 10) })}
            </span>
            <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
              {['personal', 'property', 'street', 'tier', 'name'].map((k) => (
                <option key={k} value={k}>{t(`data.sort.${k}`)}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('data.col.area')}</th>
                  <th className="n" title={t('data.col_title.personal')}>{t('data.col.personal')}</th>
                  <th className="n" title={t('data.col_title.night')}>{t('data.col.night')}</th>
                  <th className="n" title={t('data.col_title.property')}>{t('data.col.property')}</th>
                  <th className="n" title={t('data.col_title.street')}>{t('data.col.street')}</th>
                  <th className="n">{t('data.col.tier')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name || t('data.unlabelled_area')}</td>
                    <td className="n">{r.personal.toLocaleString()}</td>
                    <td className="n dim">{r.nightShare == null ? '–' : `${r.nightShare}%`}</td>
                    <td className="n">{r.property.toLocaleString()}</td>
                    <td className="n">{r.street.toLocaleString()}</td>
                    <td className="n">
                      {r.tier ? (
                        <span className="tierchip" style={{ background: TIER_COLORS[r.tier] }} title={r.zoneName}>
                          {tierLabel(r.tier)}
                        </span>
                      ) : (
                        <span className="dim">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
            {t('data.areas_footnote')}
          </div>
        </>
      )}

      {view === 'cats' && data.hasData && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>{t('data.cat.category')}</th><th>{t('data.cat.grouped')}</th><th className="n">{t('data.cat.n')}</th></tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.kind + c.category}>
                  <td>{t(`crime.${c.label}`)}<span className="dim mono"> {c.category}</span></td>
                  <td className="dim">{t(`data.kind.${c.kind}`)}</td>
                  <td className="n">{c.n.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'zones' && (
        <div className="rows">
          {data.zones.length === 0 && <div className="empty">{t('data.no_zones')}</div>}
          {data.zones
            .slice()
            .sort((a, b) => a.tier - b.tier)
            .map((z) => (
              <div className="card" key={z.id || z.name}>
                <div className="card-head" style={{ borderBottom: 'none', paddingBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="tierchip" style={{ background: TIER_COLORS[z.tier] }}>
                      {tierLabel(z.tier)}
                    </span>
                    <span className="card-title" style={{ fontSize: '0.9rem' }}>{z.name}</span>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0, gap: '0.4rem' }}>
                  <div style={{ fontSize: '0.83rem', color: 'var(--ink-2)', lineHeight: 1.7 }}>{pick(z.summary)}</div>
                  {pick(z.signals)?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {pick(z.signals).map((sig, i) => <li key={i}>{sig}</li>)}
                    </ul>
                  )}
                  {z.sources?.length > 0 && (
                    <div className="dim mono" style={{ fontSize: '0.7rem' }}>{t('data.sources_label')}{z.sources.map((id) => sourceLabel(data.sources, id)).join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {view === 'method' && (
        <>
          <div className="card">
            <div className="card-head"><div className="card-title" style={{ fontSize: '0.9rem' }}>{t('data.method_title')}</div></div>
            <div className="card-body" style={{ gap: '0.6rem', fontSize: '0.82rem', lineHeight: 1.7 }}>
              {Object.entries(data.method || {}).map(([k, v]) => (
                <div key={k} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.6rem' }}>
                  {t(`method.${v.code}`, v)}
                </div>
              ))}
              {data.window && (
                <div className="dim mono" style={{ fontSize: '0.72rem' }}>
                  {t('data.window', { personal: data.window.personal, street: data.window.street })}
                  {data.radius && t('data.radius', {
                    personal: data.radius.personal, property: data.radius.property, street: data.radius.street,
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title" style={{ fontSize: '0.9rem' }}>{t('data.sources_title')}</div></div>
            <div className="card-body" style={{ gap: '0.5rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>
                {t('data.incident_sources')}
              </div>
              {(data.sources || []).map((s, i) => (
                <div key={i} style={{ fontSize: '0.78rem', borderTop: '1px solid var(--line)', paddingTop: '0.4rem' }}>
                  <div>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener">{pick(s.label)}</a>
                    ) : pick(s.label)}
                    {s.date && <span className="dim mono"> {s.date}</span>}
                  </div>
                  {s.note && <div className="dim" style={{ fontSize: '0.74rem' }}>{pick(s.note)}</div>}
                </div>
              ))}
              {!(data.sources || []).length && (
                <div className="dim" style={{ fontSize: '0.78rem' }}>{t('data.no_sources')}</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

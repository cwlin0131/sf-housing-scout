import { useMemo, useState } from 'react';
import { listedAge, money, tone } from '../lib/api.js';
import { t } from '../i18n/index.js';

/**
 * The saved list.
 *
 * Sorting is a column the user picks rather than one ranking the tool decides, because
 * safety and convenience trade against each other and which one matters depends on the
 * day. Deactivated rows stay visible but dimmed: a listing that was $3,400 in August is
 * a useful reference in November even though it is long gone.
 */

// Labels live in the locale files, keyed by the sort name.
const SORTS = {
  safety: { get: (l) => l.safety ?? -1, dir: -1 },
  convenience: { get: (l) => l.convenience ?? -1, dir: -1 },
  commute: { get: (l) => l.commute?.minutes ?? Infinity, dir: 1 },
  price: { get: (l) => l.price ?? Infinity, dir: 1 },
  added: { get: (l) => l.first_seen_at || '', dir: -1 },
  listed: { get: (l) => l.listed_at || '', dir: -1 },
  composite: { get: (l) => l.overall_stars ?? -1, dir: -1 },
};

export default function ListPanel({
  listings, activeId, onSelect, onRefresh, refreshing, refreshResult, onMark, compositeOn,
  renderDetail,
}) {
  const [sort, setSort] = useState('safety');
  const [onlyShortlist, setOnlyShortlist] = useState(false);

  const rows = useMemo(() => {
    const { get, dir } = SORTS[sort] || SORTS.safety;
    return listings
      // Delisted rows stay in the database, because dedupe uses them to say "you looked at
      // this one in July", but they are not what the list is for.
      .filter((l) => l.status !== 'deactivated' && (!onlyShortlist || l.shortlist))
      .slice()
      .sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        return av < bv ? -dir : av > bv ? dir : 0;
      });
  }, [listings, sort, onlyShortlist]);

  const live = listings.filter((l) => l.status !== 'deactivated').length;
  const shortlisted = listings.filter((l) => l.shortlist).length;
  const hasHome = listings.some((l) => l.commute);

  return (
    <>
      <div className="listhead">
        <span style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>
          {t('list.tracking', { n: live })}
          {listings.length - live > 0 && t('list.kept_for_reference', { n: listings.length - live })}
        </span>
        <button className="ghost" onClick={onRefresh} disabled={refreshing} style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}>
          {t(refreshing ? 'list.refreshing' : 'list.refresh')}
        </button>
      </div>

      <div className="listhead">
        <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS)
            .filter(([k]) => (k !== 'composite' || compositeOn) && (k !== 'commute' || hasHome))
            .map(([k]) => (
              <option key={k} value={k}>{t('list.sort_by', { what: t(`list.sort.${k}`) })}</option>
            ))}
        </select>
        <div style={{ display: 'flex', gap: '0.7rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
          <label className="chk">
            <input type="checkbox" checked={onlyShortlist} onChange={(e) => setOnlyShortlist(e.target.checked)} />
            {t('list.only_shortlist')}{shortlisted ? ` ${shortlisted}` : ''}
          </label>
        </div>
      </div>

      {refreshResult && (
        <div className="infobox">
          {t('list.refresh_checked', { n: refreshResult.checked })}
          {['deactivated', 'price-changed', 'unchanged', 'error']
            .map((k) => {
              const n = refreshResult.results.filter((r) => r.outcome === k).length;
              return n ? t(`list.outcome.${k.replace('-', '_')}`, { n }) : null;
            })
            .filter(Boolean)
            .join(', ')}
          {refreshResult.remaining > 0 && t('list.refresh_remaining', { n: refreshResult.remaining })}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          {t(onlyShortlist ? 'list.empty_shortlist' : 'list.empty')}
        </div>
      ) : (
        <div className="rows">
          {rows.map((l) => {
            const dead = l.status === 'deactivated';
            const delta = l.priceDelta;
            const open = l.id === activeId;
            const age = listedAge(l.listed_at);
            return (
              <div key={l.id} className="row-group" data-open={open}>
              <div
                className="row-item"
                data-active={open}
                data-dead={dead}
                data-short={!!l.shortlist}
                onClick={() => onSelect(open ? null : l.id)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(open ? null : l.id); } }}
              >
                <div className="addr">
                  {l.title || l.address}
                  {dead && <span className="badge dead">{t('list.badge.dead')}</span>}
                  {!l.refreshable && <span className="badge shot">{t('list.badge.shot')}</span>}
                  {delta ? (
                    <span className={`badge ${delta > 0 ? 'up' : 'down'}`}>
                      {delta > 0 ? '↑' : '↓'}{money(Math.abs(delta))}
                    </span>
                  ) : null}
                </div>

                <div className="meta">
                  <span className="s2" data-tone={tone(l.safety)}>{t('list.safety')} <b>{l.safety ?? '–'}</b></span>
                  <span className="s2" data-tone={tone(l.convenience)}>{t('list.convenience')} <b>{l.convenience ?? '–'}</b></span>
                  {l.commute && (
                    <span className="s2" data-tone={l.commute.tone} title={t('commute.to', { place: l.commute.to })}>
                      {t(l.commute.best === 'transit' ? 'commute.icon_transit' : 'commute.icon_walk')} <b>{t('commute.minutes', { n: l.commute.minutes })}</b>
                    </span>
                  )}
                  {l.unit_type && <span>{l.unit_type}</span>}
                  {age && <span title={t('list.listed_on', { date: l.listed_at })}>{age.label}</span>}
                  {l.notes && <span title={l.notes}>✎</span>}
                </div>

                <div className="right">
                  <span className="price">{money(l.price)}</span>
                  <button
                    className="mark"
                    data-on={l.shortlist}
                    title={t(l.shortlist ? 'list.shortlist_remove' : 'list.shortlist_add')}
                    aria-pressed={l.shortlist}
                    onClick={(e) => { e.stopPropagation(); onMark(l.id, { shortlist: !l.shortlist }); }}
                  >★</button>
                </div>
              </div>
              {open && renderDetail?.(l)}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

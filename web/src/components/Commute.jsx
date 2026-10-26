import { t } from '../i18n/index.js';

/**
 * Trip to the core address. Says plainly that it is an estimate on rail and foot only,
 * and links to a real trip planner, because buses are not modelled and in some parts of
 * the city the bus is the fast option.
 */
export default function Commute({ commute, lat, lng, homeSet }) {
  if (!commute) {
    return homeSet === false ? <div className="hint commute-empty">{t('commute.no_home')}</div> : null;
  }
  const { transit, walk } = commute;
  const maps =
    `https://www.google.com/maps/dir/?api=1&travelmode=transit` +
    `&origin=${lat},${lng}&destination=${encodeURIComponent(commute.address)}`;

  return (
    <div className="commute" data-tone={commute.tone}>
      <div className="commute-head">
        <span className="lbl">{t('commute.to', { place: commute.to })}</span>
        <span className="v">{t('commute.minutes', { n: commute.minutes })}</span>
        <span className="mode">{t(commute.best === 'transit' ? 'commute.by_transit' : 'commute.by_walk')}</span>
      </div>
      {transit && commute.best === 'transit' && (
        <div className="commute-route">
          {transit.legs.map((l, i) => (
            <span key={i}>
              {l.walk != null && t('commute.leg_walk', { n: l.walk, stop: l.board })}
              {l.walk == null && t('commute.leg_change', { stop: l.board })}
              {' '}{t('commute.leg_ride', { line: l.line, n: l.ride, stop: l.alight })}
              {l.walkAfter != null && t('commute.leg_walk_after', { n: l.walkAfter })}
            </span>
          ))}
        </div>
      )}
      <div className="commute-foot">
        {commute.best === 'transit' && <span>{t('commute.walk_alt', { n: walk.minutes })}</span>}
        <span>{t('commute.estimate_note')}</span>
        <a href={maps} target="_blank" rel="noreferrer">{t('commute.open_maps')}</a>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { dupReason, listedAge, money, tone } from '../lib/api.js';
import { breakdownText, priceNote } from '../lib/breakdown.js';
import { t } from '../i18n/index.js';
import Review from './Review.jsx';
import Commute from './Commute.jsx';

/**
 * The decision surface. Everything the user needs to say keep or drop, in one card.
 *
 * There is no headline score, on purpose. Safety and convenience run against each other
 * in this city, so a single averaged number would hide the very tradeoff being decided,
 * and price is the user's own call rather than something to rate. The card shows the two
 * measured figures and the rent, and leaves the weighing to the person reading it.
 *
 * It also does not editorialise. These listings were chosen by the user, so the only
 * thing still worth flagging in red is an area they themselves marked as off-limits.
 */
export default function PreviewCard({ candidate, onKeep, onDrop, busy, homeSet }) {
  const { listing, score, review, duplicates, needsReview, token, commute } = candidate;
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState(false);

  const b = score.breakdown;
  const value = (k) => (edits[k] !== undefined ? edits[k] : listing[k]);
  const overBudget = b.price?.overBudget;
  const flagged = !!b.safety?.capped;

  return (
    <div className={`card ${flagged ? 'flagged' : ''}`}>
      <div className="card-head">
        <div className="card-title">{listing.title || listing.address}</div>
        <div className="card-sub">
          {listing.address}
          {listing.neighborhood ? ` · ${listing.neighborhood}` : ''}
        </div>
      </div>

      <div className="card-body">
        {duplicates.length > 0 && (
          <div className="warnbox">
            <b>{t('preview.dup_title')}</b>
            {duplicates.map((d) => (
              <span key={d.id}>
                {t('preview.dup_line', {
                  reason: dupReason(d.matchReason),
                  address: d.address,
                  date: d.first_seen_at.slice(0, 10),
                  price: money(d.price),
                })}
                {d.status === 'rejected' && t('preview.dup_rejected')}
                {d.status === 'deactivated' && t('preview.dup_deactivated')}
              </span>
            ))}
          </div>
        )}

        {needsReview?.length > 0 && (
          <div className="infobox">
            {t('preview.needs_review', { fields: '' })}<b>{needsReview.join(', ')}</b>
          </div>
        )}

        <div className="bars">
          <Bar label={t('preview.safety')} v={score.safety} />
          <Bar label={t('preview.convenience')} v={score.convenience} />
        </div>

        <Commute commute={commute} lat={listing.lat} lng={listing.lng} homeSet={homeSet} />

        <div className="priceline" data-over={overBudget || undefined}>
          <span className="amount">{money(b.price?.total ?? listing.price)}</span>
          <span className="per">{t('preview.per_month')}{b.price?.perSqft ? `  ${b.price.perSqft}/sqft` : ''}</span>
          <span className="vs">{priceNote(b.price?.note)}</span>
        </div>

        {score.overall_stars != null && (
          <div className="composite-note">{t('preview.composite_note', { n: score.composite })}</div>
        )}

        {b.safety?.capped && (
          <div className="warnbox">
            <b>{t('preview.avoid_title')}</b>
            <span>
              {t('preview.avoid_body', {
                name: b.safety.capped.name, from: b.safety.capped.from, to: b.safety.capped.to,
              })}
            </span>
          </div>
        )}

        {review?.text ? (
          <Review text={review.text} />
        ) : (
          <div className="hint" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            {review?.error ? t('preview.no_review_reason', { reason: review.error }) : t('preview.no_review')}
          </div>
        )}

        <div className="facts">
          <Fact k={t('fact.rent')} v={money(listing.price)} />
          <Fact k={t('fact.fees')} v={listing.monthly_fees ? money(listing.monthly_fees) : '–'} />
          <Fact k={t('fact.unit')} v={listing.unit_type || '–'} />
          <Fact k={t('fact.sqft')} v={listing.sqft ? `${listing.sqft} sqft` : '–'} />
          <Fact k={t('fact.per_sqft')} v={b.price?.perSqft ? `$${b.price.perSqft}` : '–'} />
          <Fact k={t('fact.listed')} v={listedAge(listing.listed_at)?.label || '–'} />
          <Fact k={t('fact.available')} v={listing.available_from || '–'} />
          <Fact k={t('fact.lease')} v={listing.lease_term || '–'} />
          <Fact k={t('fact.laundry')} v={listing.laundry || '–'} />
        </div>

        <Breakdown b={b} />

        {editing && (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {['address', 'price', 'monthly_fees', 'beds', 'baths', 'sqft'].map((k) => (
              <label key={k} style={{ display: 'grid', gridTemplateColumns: '5rem 1fr', gap: '0.4rem', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <input
                  value={value(k) ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = k === 'address' ? raw : raw === '' ? null : Number(raw);
                    setEdits((p) => ({ ...p, [k]: v }));
                  }}
                />
              </label>
            ))}
            <div className="hint">{t('preview.edit_hint')}</div>
          </div>
        )}

        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => onKeep(token, edits)}>
            {t('preview.keep')}
          </button>
          <button className="danger" disabled={busy} onClick={() => onDrop(token)}>
            {t('preview.drop')}
          </button>
          <button className="ghost" style={{ flex: '0 0 auto' }} onClick={() => setEditing((v) => !v)}>
            {t(editing ? 'preview.collapse' : 'preview.fix')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One score. The number is the thing being read, so it is set large and carries the colour;
 * the bar underneath is there to make two scores comparable at a glance, not to be read
 * precisely. `aria-hidden` on the bar keeps a screen reader from announcing the value twice.
 */
function Bar({ label, v }) {
  return (
    <div className="bar" data-tone={tone(v)}>
      <span className="lbl">{label}</span>
      <span className="v">{v ?? '–'}</span>
      <span className="track" aria-hidden="true">
        <span className="fill" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
      </span>
    </div>
  );
}

const Fact = ({ k, v }) => (
  <div>
    <span>{k}</span>
    <span>{v}</span>
  </div>
);


function Breakdown({ b }) {
  return (
    <details className="more">
      <summary>{t('preview.breakdown_summary')}</summary>
      <pre>{breakdownText(b)}</pre>
    </details>
  );
}

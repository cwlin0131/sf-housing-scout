import { useEffect, useState } from 'react';
import { goneReason, listedAge, money } from '../lib/api.js';
import { breakdownText } from '../lib/breakdown.js';
import { t } from '../i18n/index.js';
import Review from './Review.jsx';
import Commute from './Commute.jsx';

/**
 * The expanded view of one saved listing, shown inline beneath its own row.
 *
 * Sections collapse because this opens inside the list: anything left expanded pushes the
 * rows below it off screen. The short review is open by default since it is the reason to
 * expand at all; the rest opens on demand. Notes start open when there is something
 * written, so an existing note is never hidden behind a closed section.
 */
export default function ListingDetail({ listing, onDeactivate, onSaveNotes }) {
  if (!listing) return null;
  const b = listing.breakdown;
  const age = listedAge(listing.listed_at);

  return (
    <div className="detail">
      <div className="detail-head">
        {age && (
          <span title={t(listing.listed_basis === 'days' ? 'detail.listed_basis_days' : 'detail.listed_basis_date')}>
            {age.label} ({listing.listed_at}{listing.listed_basis === 'days' ? t('detail.listed_inferred') : ''})
          </span>
        )}
        <span>{t('detail.added', { date: listing.first_seen_at?.slice(0, 10) })}</span>
        {listing.last_checked_at && (
          <span>{t('detail.last_checked', { date: listing.last_checked_at.slice(0, 10) })}</span>
        )}
        {listing.priceDelta ? (
          <span>{t('detail.price_at_add', { price: money(listing.price - listing.priceDelta) })}</span>
        ) : null}
      </div>

      {listing.deactivate_reason && (
        <div className="warnbox"><b>{t('detail.deactivated')}</b><span>{goneReason(listing.deactivate_reason)}</span></div>
      )}

      {b?.safety?.capped && (
        <div className="warnbox">
          <b>{t('detail.avoid_title')}</b>
          <span>{t('detail.avoid_body', {
            name: b.safety.capped.name, from: b.safety.capped.from, to: b.safety.capped.to,
          })}</span>
        </div>
      )}

      <Commute commute={listing.commute} lat={listing.lat} lng={listing.lng} />

      {listing.review_text && (
        <Section title={t('detail.section.review')} defaultOpen>
          <Review text={listing.review_text} />
        </Section>
      )}

      <Section title={t('detail.section.notes')} defaultOpen={!!listing.notes}>
        <Notes listing={listing} onSave={onSaveNotes} />
      </Section>

      {b && (
        <Section title={t('detail.section.breakdown')}>
          <pre className="bd">{breakdownText(b)}</pre>
        </Section>
      )}

      <div className="actions">
        {listing.url && (
          <button onClick={() => window.open(listing.url, '_blank', 'noopener')}>{t('detail.open_source_page')}</button>
        )}
        {listing.status === 'saved' && (
          <button className="danger" onClick={() => onDeactivate(listing.id)}>{t('detail.mark_gone')}</button>
        )}
      </div>
    </div>
  );
}

function Section({ title, defaultOpen = false, children }) {
  return (
    <details className="sect" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="sect-body">{children}</div>
    </details>
  );
}

/**
 * Your own words about the place. Keyed on the listing id so switching rows resets the
 * draft rather than carrying one listing's half-typed note onto another.
 */
function Notes({ listing, onSave }) {
  const [text, setText] = useState(listing.notes || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(listing.notes || ''); }, [listing.id, listing.notes]);

  const dirty = text !== (listing.notes || '');
  const commit = async () => {
    if (!dirty) return;
    setSaving(true);
    try { await onSave(listing.id, text); } finally { setSaving(false); }
  };

  return (
    <div className="notes">
      <textarea
        rows={3}
        placeholder={t('detail.notes_placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      <span className="hint">{saving ? t('detail.saving') : dirty ? t('detail.blur_saves') : ' '}</span>
    </div>
  );
}

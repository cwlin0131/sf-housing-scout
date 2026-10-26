/**
 * The "why this score" text, shared by the preview card and the saved-listing detail.
 *
 * Assembled as one string rather than JSX: a <pre> full of expressions renders with
 * mangled spacing, and the alignment is the point here.
 *
 * The server sends notes as codes rather than sentences, so this file decides what the
 * reader sees in their own language. Column alignment is baked into the translation
 * strings, which means a locale is free to pick a width that suits its own script.
 */
import { t } from '../i18n/index.js';
import { pick, tierLabel } from './api.js';

const amenityLabel = (k) => t(`amenity.${k}`);

/** A `{ code, ... }` note from the scorer, rendered in the current language. */
const noteText = (note) => {
  if (!note) return '';
  if (typeof note === 'string') return note; // scores stored before notes became codes
  return t(`note.${note.code}`);
};

export function priceNote(note) {
  if (!note) return '';
  if (typeof note === 'string') return note;
  const amount = note.amount == null ? null : `$${note.amount.toLocaleString('en-US')}`;
  return t(`price.${note.code}`, { amount });
}

export function breakdownText(b) {
  const s = b.safety;
  const c = b.convenience;
  const tr = c?.parts?.transit;
  const a = c?.parts?.amenities;
  const out = [];

  // The common name is what a renter searches for; the zone is the coarser area the
  // written read was researched against, and the two often differ (Rincon Hill sits inside
  // the Financial District zone). Both are shown so neither is quietly stood in for.
  if (s?.place) out.push(t('bd.place', { place: s.place }));
  if (s?.zone) {
    out.push(
      t('bd.zone', { name: s.zone.name, tier: tierLabel(s.zone.tier) })
        + (s.place && s.place !== s.zone.name ? t('bd.zone_broader') : ''),
      pick(s.zone.summary),
      ''
    );
  }

  if (s?.basis === 'incidents') {
    const p = s.parts;
    const change = p.trend.changePct == null
      ? ''
      : ` ${p.trend.changePct > 0 ? '+' : ''}${p.trend.changePct}%`;
    // Two different frames, so both are labelled. The score is absolute; the percentile is
    // a citywide rank, and in a dense district the two deliberately disagree.
    out.push(
      t('bd.safety', { score: s.score }),
      t('bd.safety_personal', { n: p.personal.count, r: p.personal.radius }),
      t('bd.safety_rank', { pct: Math.round((1 - p.personal.percentile) * 100) }),
      t('bd.safety_property', { n: p.property.count, r: p.property.radius }),
      t('bd.safety_street', { n: p.street.count, r: p.street.radius }),
      t('bd.safety_trend', { direction: t(`bd.trend.${p.trend.direction}`), change })
    );
  } else {
    out.push(t('bd.safety_nodata', {
      score: s?.score ?? '–',
      note: noteText(s?.note) || t('bd.insufficient'),
    }));
  }

  out.push('', t('bd.convenience', { score: c?.score ?? '–' }));
  if (tr?.muni_metro) {
    out.push(t('bd.muni', {
      name: tr.muni_metro.name, min: Math.round(tr.muni_metro.minutes), m: tr.muni_metro.metres,
    }));
  }
  if (tr?.bart) {
    out.push(t('bd.bart', { name: tr.bart.name, min: Math.round(tr.bart.minutes), m: tr.bart.metres }));
  }
  if (tr?.linesWithin800) out.push(t('bd.lines', { n: tr.linesWithin800 }));

  if (a?.ok) {
    const counts = Object.entries(a.counts)
      .filter(([, v]) => v)
      .map(([k, v]) => `${amenityLabel(k)} ${v}`)
      .join(', ');
    out.push(t('bd.amenities', { list: counts || t('bd.amenities_none') }));

    const near = Object.entries(a.nearest || {})
      .filter(([, v]) => v)
      .map(([k, v]) => t('bd.nearest_item', { label: amenityLabel(k), min: Math.round(v.metres / 80) }))
      .join(', ');
    if (near) out.push(t('bd.nearest', { list: near }));
  }

  const terrain = c?.parts?.terrain;
  if (terrain?.climbMetres != null) {
    out.push(t('bd.terrain', { m: terrain.climbMetres, note: noteText(terrain.note) }));
  }
  if (c?.parts?.anchors?.detail?.length) {
    const list = c.parts.anchors.detail
      .map((x) => t('bd.anchors_item', { name: x.name, min: x.minutes }))
      .join(', ');
    out.push(t('bd.anchors', { list }));
  }
  if (c?.missing?.length) {
    out.push(t('bd.missing', { list: c.missing.map((k) => t(`comp.${k}`)).join(', ') }));
  }

  out.push('', t('bd.price', { score: b.price?.score ?? '–', note: priceNote(b.price?.note) }));
  return out.join('\n');
}

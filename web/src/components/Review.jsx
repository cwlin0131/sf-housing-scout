import { t } from '../i18n/index.js';

/**
 * Renders the three-point review.
 *
 * The prompt asks for exactly three labelled lines, but a model is not a parser
 * and the shape is not guaranteed. When the text matches, each point gets its
 * own row so the card can be scanned rather than read; when it doesn't, the
 * text is shown as-is. A malformed review should look plain, never broken.
 *
 * Both languages' labels are accepted whatever the interface is set to, because a
 * review written months ago in one language is still in the database when the reader
 * switches to the other. Matching only the current language would silently drop every
 * older review back to unformatted prose.
 */

const POINTS = ['safety', 'transit', 'community'];
const LABELS = {
  safety: ['Safety', '治安'],
  transit: ['Transit', '交通'],
  community: ['Neighborhood', 'Neighbourhood', 'Community', '社區'],
};

const ALL = Object.values(LABELS).flat();
const LINE = new RegExp(`^\\s*(${ALL.join('|')})\\s*[：:]\\s*(.+)$`, 'i');
const keyFor = (label) =>
  POINTS.find((k) => LABELS[k].some((v) => v.toLowerCase() === label.toLowerCase()));

export function parseReview(text) {
  if (!text) return null;
  const points = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(LINE);
    if (m) {
      const key = keyFor(m[1]);
      if (key) points.push({ key, body: m[2].trim() });
    } else if (raw.trim()) {
      return null; // stray prose, fall back to plain rendering
    }
  }
  return points.length === POINTS.length ? points : null;
}

export default function Review({ text }) {
  if (!text) return null;
  const points = parseReview(text);
  if (!points) return <div className="review">{text}</div>;

  return (
    <dl className="review review-points">
      {points.map((p) => (
        <div key={p.key}>
          <dt>{t(`review.label.${p.key}`)}</dt>
          <dd>{p.body}</dd>
        </div>
      ))}
    </dl>
  );
}

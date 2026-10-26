import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';

/**
 * The knobs that change what a score means.
 *
 * Saving rescores the whole list, because a stored score computed under the old numbers
 * is stale the moment these change. Each score also records the settings it was computed
 * under, so a list built over months can still be read honestly.
 */
export default function SettingsPanel({ settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => { setDraft(settings); }, [settings]);
  if (!draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = (group, key, v) => setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }));
  const num = (group, key) => (e) => set(group, key, e.target.value === '' ? '' : Number(e.target.value));
  const setAvoid = (next) => setDraft((d) => ({ ...d, avoid: next }));

  const save = async () => {
    setBusy(true); setErr(null); setSaved(null);
    try {
      const res = await onSave(draft);
      setSaved(res?.rescored ? t('settings.rescored', { n: res.rescored }) : t('settings.saved'));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <section>
        <h3>{t('settings.home_title')}</h3>
        <p className="hint">{t('settings.home_hint')}</p>
        <label className="field">
          <span>{t('settings.home_label')}</span>
          <input
            placeholder={t('settings.home_label_placeholder')}
            value={draft.home?.label || ''}
            onChange={(e) => set('home', 'label', e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('settings.home_address')}</span>
          <input
            placeholder={t('settings.home_address_placeholder')}
            value={draft.home?.address || ''}
            onChange={(e) => set('home', 'address', e.target.value)}
          />
        </label>
        {draft.home?.address && draft.home.address === settings.home?.address && settings.home?.lat != null && (
          <p className="hint">{t('settings.home_located')}</p>
        )}
      </section>

      <section>
        <h3>{t('settings.budget_title')}</h3>
        <p className="hint">{t('settings.budget_hint')}</p>
        <label className="field">
          <span>{t('settings.budget_max')}</span>
          <input type="number" min="100" step="100" value={draft.budget.max} onChange={num('budget', 'max')} />
        </label>
        <label className="field">
          <span>{t('settings.budget_ideal')}</span>
          <input type="number" min="0" step="100" value={draft.budget.ideal} onChange={num('budget', 'ideal')} />
        </label>
        <p className="hint">{t('settings.budget_curve_hint')}</p>
      </section>

      <section>
        <h3>{t('settings.avoid_title')}</h3>
        <p className="hint">{t('settings.avoid_hint')}</p>
        <AvoidList items={draft.avoid || []} onChange={setAvoid} />
      </section>

      <section>
        <h3>{t('settings.composite_title')}</h3>
        <label className="chk">
          <input
            type="checkbox"
            checked={draft.composite.enabled}
            onChange={(e) => set('composite', 'enabled', e.target.checked)}
          />
          {t('settings.composite_toggle')}
        </label>
        <div className="warnbox" style={{ marginTop: '0.5rem' }}>
          <b>{t('settings.composite_warn_title')}</b>
          <span>{t('settings.composite_warn_body')}</span>
        </div>
        {draft.composite.enabled && (
          <>
            <label className="field">
              <span>{t('settings.weight_safety')}</span>
              <input type="number" min="0" max="1" step="0.05" value={draft.composite.safety} onChange={num('composite', 'safety')} />
            </label>
            <label className="field">
              <span>{t('settings.weight_convenience')}</span>
              <input type="number" min="0" max="1" step="0.05" value={draft.composite.convenience} onChange={num('composite', 'convenience')} />
            </label>
          </>
        )}
      </section>

      {err && <div className="warnbox"><b>{t('settings.save_failed')}</b><span>{err}</span></div>}
      {saved && !dirty && <div className="infobox">{saved}</div>}

      <button className="primary" disabled={!dirty || busy} onClick={save}>
        {busy ? t('settings.saving') : dirty ? t('settings.save') : t('settings.no_change')}
      </button>
    </div>
  );
}

/**
 * Areas the reader has ruled out for themselves.
 *
 * A name here is matched against the listing's neighbourhood, its coarse zone, and the
 * common name, so anything a person would actually say works, including names the map
 * does not label. The cap is a ceiling rather than a subtraction: the point is "no matter
 * what the numbers say, I am not living here", and the card states that it was applied.
 */
function AvoidList({ items, onChange }) {
  const [name, setName] = useState('');
  const [cap, setCap] = useState(35);

  const add = () => {
    if (!name.trim()) return;
    onChange([...items, { name: name.trim(), cap: Number(cap) || 0 }]);
    setName('');
  };

  return (
    <>
      {items.length === 0 && <p className="hint">{t('settings.avoid_empty')}</p>}
      {items.map((a, i) => (
        <div className="avoid-row" key={`${a.name}-${i}`}>
          <span className="nm">{a.name}</span>
          <input
            type="number" min="0" max="100" step="5" value={a.cap}
            aria-label={t('settings.avoid_cap')}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, cap: Number(e.target.value) } : x)))}
          />
          <button className="ghost" title={t('settings.avoid_remove')} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="avoid-row">
        <input
          placeholder={t('settings.avoid_name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <input
          type="number" min="0" max="100" step="5" value={cap}
          aria-label={t('settings.avoid_cap')}
          onChange={(e) => setCap(e.target.value)}
        />
        <button className="ghost" onClick={add} disabled={!name.trim()}>{t('settings.avoid_add')}</button>
      </div>
    </>
  );
}

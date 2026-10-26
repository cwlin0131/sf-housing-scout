import { useState } from 'react';
import { t } from '../i18n/index.js';

/**
 * The user's own pins. These drive 40% of the convenience score, so they are editable
 * rather than baked into config: what counts as convenient changes as a life does.
 */
export default function AnchorPanel({ anchors, onAdd, onUpdate, onDelete, pinMode, setPinMode }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!name.trim() || !address.trim()) {
      setErr(t('anchor.both_required'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onAdd({ name: name.trim(), address: address.trim(), weight: 1 });
      setName('');
      setAddress('');
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        <input placeholder={t('anchor.name_placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder={t('anchor.address_placeholder')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="row" style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="primary" style={{ flex: 1 }} onClick={submit} disabled={busy}>
            {busy ? t('anchor.locating') : t('anchor.add')}
          </button>
          <button
            className="ghost"
            data-on={pinMode}
            onClick={() => setPinMode(!pinMode)}
            title={t('anchor.pin_mode_title')}
          >
            {t(pinMode ? 'anchor.pin_mode_on' : 'anchor.pin_mode_off')}
          </button>
        </div>
        {pinMode && <div className="infobox">{t('anchor.pin_mode_hint')}</div>}
        {err && <div className="warnbox"><b>{t('anchor.failed')}</b><span>{err}</span></div>}
      </div>

      <div className="rows">
        {anchors.length === 0 && <div className="empty">{t('anchor.empty')}</div>}
        {anchors.map((a) => (
          <div className="anchor-item" key={a.id}>
            <div>
              <div className="nm">{a.name}</div>
              <div className="nt">
                {a.note || a.address || `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <select
                value={a.weight}
                onChange={(e) => onUpdate(a.id, { weight: +e.target.value })}
                style={{ width: 'auto', padding: '0.15rem 0.3rem', fontSize: '0.72rem' }}
                title={t('anchor.weight_title')}
              >
                {[0, 1, 2, 3].map((w) => (
                  <option key={w} value={w}>{w === 0 ? t('anchor.weight_none') : t('anchor.weight_n', { n: w })}</option>
                ))}
              </select>
              <button
                className="ghost danger"
                onClick={async () => {
                  setErr(null);
                  try { await onDelete(a.id); } catch (e) { setErr(String(e.message || e)); }
                }}
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                title={t('anchor.delete')}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="hint" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
        {t('anchor.footnote')}
      </div>
    </>
  );
}

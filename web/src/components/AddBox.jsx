import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';

/**
 * One box, three inputs: a Zillow URL, a bare address, or screenshots.
 *
 * Screenshots accumulate because a listing rarely fits on one screen. Paste as many as you
 * scroll past and they go to the reader together, so it can reconcile a price at the top
 * with square footage further down into one unit.
 */
const ENTER_KEY = 'sf-housing:enter-submits';

export default function AddBox({ onScore, busy }) {
  const [text, setText] = useState('');
  const [shots, setShots] = useState([]);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  // The first score near a new spot looks up shops and elevation from shared free services,
  // which can take most of a minute. Without a word, a button that says "Scoring…" that
  // long reads as frozen.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setSlow(false); return undefined; }
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, [busy]);
  // Nearly every input here is one line, so Enter submits by default. Anyone pasting a
  // multi-line address wants the opposite, hence the switch, remembered between sessions.
  const [enterSubmits, setEnterSubmits] = useState(
    () => localStorage.getItem(ENTER_KEY) !== '0'
  );

  const setEnterPref = (on) => {
    setEnterSubmits(on);
    localStorage.setItem(ENTER_KEY, on ? '1' : '0');
  };

  const addFiles = useCallback(async (files) => {
    const images = [];
    for (const file of files) {
      if (!file || !/^image\//.test(file.type)) continue;
      images.push(
        await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(file);
        })
      );
    }
    if (images.length) {
      setErr(null);
      setShots((prev) => [...prev, ...images].slice(0, 8));
    }
  }, []);

  const onPaste = useCallback(
    (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((i) => i.kind === 'file' && /^image\//.test(i.type))
        .map((i) => i.getAsFile());
      if (files.length) {
        e.preventDefault(); // keep the image out of the textarea as a filename
        addFiles(files);
      }
    },
    [addFiles]
  );

  const submit = async () => {
    setErr(null);
    try {
      if (shots.length) {
        await onScore({ images: shots, url: text.trim() || undefined });
      } else {
        await onScore({ input: text.trim() });
      }
      setText('');
      setShots([]);
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const canSubmit = !busy && (shots.length > 0 || text.trim().length > 0);

  return (
    <div className="addbox">
      <textarea
        value={text}
        placeholder={t('add.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // Ctrl/Cmd+Enter always sends, Shift+Enter always makes a newline, whatever the
          // preference says. Only a bare Enter is up for debate.
          const forced = e.metaKey || e.ctrlKey;
          if (e.shiftKey && !forced) return;
          if (!forced && !enterSubmits) return;
          e.preventDefault();
          if (canSubmit) submit();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles([...(e.dataTransfer?.files || [])]);
        }}
      />

      {shots.length > 0 && (
        <>
          <div className="shots">
            {shots.map((src, i) => (
              <div className="shot" key={i}>
                <img src={src} alt={t('add.shot_alt', { n: i + 1 })} />
                <span className="n">{i + 1}</span>
                <button
                  onClick={() => setShots((p) => p.filter((_, j) => j !== i))}
                  title={t('add.shot_remove')}
                  aria-label={t('add.shot_remove_aria', { n: i + 1 })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="hint">
            {t('add.shots_hint', { n: shots.length })}
          </div>
        </>
      )}

      <div className="row addrow">
        <button className="primary" style={{ flex: 1 }} disabled={!canSubmit} onClick={submit}>
          {busy ? t('add.scoring') : shots.length ? t('add.score_shots', { n: shots.length }) : t('add.score')}
        </button>
        <button className="ghost" onClick={() => fileRef.current?.click()} disabled={busy} title={t('add.pick_files_title')}>
          {t('add.pick_files')}
        </button>
        {(shots.length > 0 || text) && (
          <button className="ghost" onClick={() => { setShots([]); setText(''); setErr(null); }} disabled={busy}>
            {t('add.clear')}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }}
      />

      <label className="chk enterchk">
        <input type="checkbox" checked={enterSubmits} onChange={(e) => setEnterPref(e.target.checked)} />
        {t('add.enter_submits')}
        <span className="k">{t(enterSubmits ? 'add.enter_newline_hint' : 'add.ctrl_enter_hint')}</span>
      </label>

      {err && <div className="warnbox"><b>{t('add.failed')}</b><span>{err}</span></div>}
      {slow && <div className="hint">{t('add.slow_hint')}</div>}
      {!shots.length && !err && !slow && (
        <div className="hint">{t('add.address_only_hint')}</div>
      )}
    </div>
  );
}

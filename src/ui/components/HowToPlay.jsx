import { useEffect, useRef, useState } from 'react';
import { INTRO } from '../content/copy.js';


/** The cards live in their own component so every open starts at card 1 (it is only mounted while open). */
function Cards({ site, onClose }) {
  const dayWord = site === 'mars' ? 'sol' : 'day';
  const cards = INTRO.cards(site);
  const [index, setIndex] = useState(0);
  const primaryRef = useRef(null);
  const card = cards[index];
  const isLast = index === cards.length - 1;

  return (
    <>
      <p className="howto-step">{INTRO.step(index + 1, cards.length)}</p>
      <div className="howto-card" aria-live="polite" aria-atomic="true">
        <h3 className="howto-card-title">{card.title}</h3>
        {card.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="howto-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {INTRO.skip}
        </button>
        <span className="howto-nav">
          {index > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (index === 1) primaryRef.current?.focus(); // Back is about to disappear; keep focus inside.
                setIndex(index - 1);
              }}
            >
              {INTRO.back}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            className="btn btn-primary"
            data-autofocus
            onClick={() => (isLast ? onClose() : setIndex(index + 1))}
          >
            {isLast ? INTRO.done(dayWord) : INTRO.next}
          </button>
        </span>
      </div>
    </>
  );
}

export function HowToPlay({ open, site, onClose, returnFocusRef }) {
  const ref = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open) {
      wasOpen.current = true;
      if (dlg.open) return;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      dlg.querySelector('[data-autofocus]')?.focus();
    } else {
      if (dlg.open) {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
      }
      // Firefox may close the dialog itself on Esc (despite preventDefault), so return
      // focus whenever it was open, not only when we closed it here.
      if (wasOpen.current) {
        wasOpen.current = false;
        const target = returnFocusRef?.current ?? document.querySelector('main h1, main h2');
        if (target) {
          if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) {
            target.setAttribute('tabindex', '-1');
          }
          target.focus();
        }
      }
    }
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={ref}
      className="dialog howto"
      aria-labelledby="howto-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <h2 id="howto-title">{INTRO.heading}</h2>
      {open && <Cards site={site} onClose={onClose} />}
    </dialog>
  );
}

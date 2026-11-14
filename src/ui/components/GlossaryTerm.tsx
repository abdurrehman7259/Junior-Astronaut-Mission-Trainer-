import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey } from '../content/glossary';
import './GlossaryTerm.css';

export function GlossaryTerm({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Keep the popover inside the viewport (NFR-07, 360 px): shift it left by however much it overflows the right edge.
  useLayoutEffect(() => {
    const pop = popoverRef.current;
    if (!open || !pop) return;
    const place = () => {
      pop.style.left = '0px';
      const margin = 16;
      const limit = document.documentElement.clientWidth - margin;
      const rect = pop.getBoundingClientRect();
      const overflow = rect.right - limit;
      if (overflow > 0) pop.style.left = `${-Math.min(overflow, Math.max(0, rect.left - margin))}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  return (
    <span className="glossary-term" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="glossary-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        {children ?? entry.term}
        <span className="glossary-mark" aria-hidden="true">
          ?
        </span>
      </button>
      {open && (
        <span ref={popoverRef} id={popoverId} role="region" aria-label={entry.term} className="glossary-popover">
          <span className="glossary-definition">{entry.definition}</span>
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </span>
      )}
    </span>
  );
}

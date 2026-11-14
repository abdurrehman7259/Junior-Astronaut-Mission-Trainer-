import { useEffect, useRef, type RefObject } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  retrievedAt: string | null;
  isPlaceholder: boolean;
  /** Element that gets focus back when the panel closes. */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function DataPanel({ open, onClose, retrievedAt, isPlaceholder, returnFocusRef }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    } else if (!open && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
      returnFocusRef.current?.focus();
    }
  }, [open, returnFocusRef]);

  const label = isPlaceholder
    ? 'Placeholder (not real data)'
    : `Archived (retrieved ${retrievedAt?.slice(0, 10) ?? 'unknown date'})`;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="data-panel-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <h2 id="data-panel-title">Data used</h2>
      <p>
        <strong>NASA DONKI</strong> solar events: {label}
      </p>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

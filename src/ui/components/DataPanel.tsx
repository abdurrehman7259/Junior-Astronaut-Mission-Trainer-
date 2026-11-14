import { useEffect, useRef, type RefObject } from 'react';
import { formatCheckedTime } from './LiveBanner';
import type { LiveState } from '../../app/live';
import type { DoseCalibration, MarsSiteInfo, ScienceFact, Snapshot } from '../../shared/types';
import './DataPanel.css';

export interface DataSourceEntry {
  id: string;
  name: string;
  /** One kid-friendly sentence: what the game uses it for. */
  use: string;
  url?: string;
  /** Status label, e.g. "Archived (retrieved 2026-11-14)". */
  status: string;
  /** Optional extra line (e.g. the live feed check time). */
  extra?: string;
}

export interface BuildSourcesInput {
  retrievedAt: string | null;
  isPlaceholder: boolean;
  osdr?: Snapshot<ScienceFact> | null;
  radlab?: DoseCalibration | null;
  live?: LiveState;
  donkiUrl?: string;
  /** Present when Mars data is loaded (Mars is active or available). */
  mars?: { retrievedAt: string; site: MarsSiteInfo | null } | null;
}

export const DONKI_URL = 'https://ccmc.gsfc.nasa.gov/tools/DONKI/';

const archived = (iso: string | null | undefined) => `Archived (retrieved ${iso?.slice(0, 10) ?? 'unknown date'})`;

/**
 * Pure list of data sources for the panel. Append entries here (Mars Trek, Mars DONKI) later.
 * D-019: the RadLab dose-rate number is deliberately never shown, only the qualitative note.
 */
export function buildDataSources(input: BuildSourcesInput): DataSourceEntry[] {
  const { retrievedAt, isPlaceholder, osdr = null, radlab = null, live, mars = null } = input;
  const donki: DataSourceEntry = {
    id: 'donki',
    name: 'NASA DONKI (space weather)',
    use: 'Solar flares and CMEs on your mission days.',
    url: input.donkiUrl ?? DONKI_URL,
    status: isPlaceholder ? 'Placeholder (not real data)' : archived(retrievedAt),
  };
  if (live?.status === 'live' && live.data) {
    donki.extra = `Live feed: checked ${formatCheckedTime(live.data.fetchedAt)} UTC`;
  }
  const marsEntries: DataSourceEntry[] = [];
  if (mars) {
    marsEntries.push({
      id: 'donki-mars',
      name: 'NASA DONKI (Mars-impact CMEs)',
      use: "Real CMEs that NASA's space-weather model predicted would reach Mars.",
      url: input.donkiUrl ?? DONKI_URL,
      status: archived(mars.retrievedAt),
    });
    if (mars.site) {
      marsEntries.push({
        id: 'mars-trek',
        name: 'NASA Mars Trek (Jezero Crater)',
        use: 'Maps of Mars. The Mars base in the game sits in Jezero Crater.',
        url: mars.site.marsTrekUrl,
        status: archived(mars.site.retrievedAt),
        extra: mars.site.imageCredit ? `Image credit: ${mars.site.imageCredit}` : undefined,
      });
    }
  }
  return [
    donki,
    ...marsEntries,
    {
      id: 'osdr',
      name: 'NASA OSDR (Open Science Data Repository)',
      use: 'Real space biology studies in your mission report.',
      url: 'https://osdr.nasa.gov/bio/',
      status: osdr ? archived(osdr.retrievedAt) : 'Not loaded',
    },
    {
      id: 'radlab',
      name: 'NASA RadLab (ISS radiation)',
      use: "The space station is inside Earth's magnetic field. The Moon's surface is not, so radiation there is higher.",
      url: radlab?.sourceUrl ?? 'https://visualization.osdr.nasa.gov/radlab/',
      status: radlab ? archived(radlab.retrievedAt) : 'Not loaded',
    },
    {
      id: 'rules',
      name: 'Game rules',
      use: 'Meters, power units and dose numbers are game rules, not real measurements.',
      status: 'Made up for the game',
    },
  ];
}

interface Props {
  open: boolean;
  onClose: () => void;
  retrievedAt: string | null;
  isPlaceholder: boolean;
  osdr?: Snapshot<ScienceFact> | null;
  radlab?: DoseCalibration | null;
  mars?: { retrievedAt: string; site: MarsSiteInfo | null } | null;
  live?: LiveState;
  /** Element that gets focus back when the panel closes. */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function DataPanel({ open, onClose, retrievedAt, isPlaceholder, osdr, radlab, mars, live, returnFocusRef }: Props) {
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

  const sources = buildDataSources({ retrievedAt, isPlaceholder, osdr, radlab, live, mars });

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
      <p>Everything real in this game comes from NASA. Game numbers are game rules.</p>
      <ul className="data-sources">
        {sources.map((s) => (
          <li key={s.id} className="data-source">
            <h3>{s.name}</h3>
            <p>{s.use}</p>
            {s.url && (
              <p>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  Visit {s.name.split(' (')[0]}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </p>
            )}
            <p className="data-source-status">{s.status}</p>
            {s.extra && <p>{s.extra}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

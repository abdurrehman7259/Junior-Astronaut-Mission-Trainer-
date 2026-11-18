import { useEffect, useRef } from 'react';
import { formatCheckedTime } from './LiveBanner.jsx';


export const DONKI_URL = 'https://ccmc.gsfc.nasa.gov/tools/DONKI/';

const archived = (iso) => (iso ? `Archived (retrieved ${iso.slice(0, 10)})` : 'Not loaded');

/** Wording follows how many of the pool's storms NASA's model really listed as reaching Mars. */
function marsUse(events = []) {
  const gameOnly = events.filter((e) => e.marsImpact === 'game-only').length;
  if (gameOnly === 0) return "Real CMEs that NASA's space-weather model predicted would reach Mars.";
  if (gameOnly < events.length) {
    return "Real CMEs that NASA's space-weather model predicted would reach Mars. Some are real storms that, in this game, also reach Mars.";
  }
  return 'Real storms recorded by NASA. In this game, they also reach Mars.';
}

/**
 * Pure list of data sources for the panel. Append entries here (Mars Trek, Mars DONKI) later.
 * D-019: the RadLab dose-rate number is deliberately never shown, only the qualitative note.
 */
export function buildDataSources(input) {
  const { retrievedAt, isPlaceholder, osdr = null, radlab = null, live, mars = null } = input;
  const donki = {
    id: 'donki',
    name: 'NASA DONKI (space weather)',
    use: 'Solar flares and CMEs on your mission days.',
    url: input.donkiUrl ?? DONKI_URL,
    status: isPlaceholder ? 'Placeholder (not real data)' : archived(retrievedAt),
  };
  if (live?.status === 'live' && live.data) {
    donki.extra = `Live feed: checked ${formatCheckedTime(live.data.fetchedAt)} UTC`;
  }
  const marsEntries = [];
  if (mars) {
    marsEntries.push({
      id: 'donki-mars',
      name: 'NASA DONKI (Mars-impact CMEs)',
      use: marsUse(mars.events),
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
      // RadLab home page (the snapshot's raw API query doesn't support the note); the note gets its own citation.
      url: 'https://visualization.osdr.nasa.gov/radlab/',
      citation: {
        label: 'Source: NASA Apollo radiation page',
        url: 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html',
      },
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

export function DataPanel({ open, onClose, retrievedAt, isPlaceholder, osdr, radlab, mars, live, returnFocusRef }) {
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
    } else {
      if (dlg.open) {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
      }
      // Firefox may close the dialog itself on Esc (despite preventDefault), so return
      // focus whenever it was open, not only when we closed it here.
      if (wasOpen.current) {
        wasOpen.current = false;
        returnFocusRef.current?.focus();
      }
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
      <p>Everything real in this game comes from NASA and NOAA. Game numbers are game rules.</p>
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
            {s.citation && (
              <p>
                <a href={s.citation.url} target="_blank" rel="noopener noreferrer">
                  {s.citation.label}
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

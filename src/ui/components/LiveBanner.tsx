import type { LiveState } from '../../app/live';
import type { SolarEvent } from '../../shared/types';
import { formatRealDate, KIND_WORDS } from './EventCard';
import './LiveBanner.css';

interface Props {
  live: LiveState;
  /** Archived DONKI snapshot retrievedAt (ISO), null in dev placeholder mode. */
  retrievedAt: string | null;
  isPlaceholder?: boolean;
}

function strongest(events: SolarEvent[]): SolarEvent {
  return events.reduce((best, e) => (e.severity > best.severity ? e : best));
}

/** "2026-11-14T08:14:30Z" -> "08:14" (UTC). */
export function formatCheckedTime(iso: string): string {
  return /T(\d\d:\d\d)/.exec(iso)?.[1] ?? '';
}

/**
 * Live status line. Only a `live: true` response may use the word "Live" (NFR-04 data honesty).
 * While loading it renders an empty, polite live region so the layout does not jump.
 */
export function LiveBanner({ live, retrievedAt, isPlaceholder = false }: Props) {
  let text: string | null = null;
  let badge: string | null = null;
  let kind: 'live' | 'archived' = 'archived';

  if (live.status === 'live' && live.data) {
    kind = 'live';
    const storms = live.data.events.filter((e) => e.kind !== 'QUIET');
    badge = `Live (checked ${formatCheckedTime(live.data.fetchedAt)} UTC)`;
    if (storms.length === 0) {
      text = 'Live from NASA: the Sun has been calm this week.';
    } else {
      const top = strongest(storms);
      text = `Live from NASA: ${storms.length} solar events in the last 7 days. Strongest: ${KIND_WORDS[top.kind]} on ${formatRealDate(top.realDate)}.`;
    }
  } else if (live.status === 'archived') {
    const date = retrievedAt?.slice(0, 10);
    if (isPlaceholder || !date) {
      text = 'Live NASA feed unavailable. Dev mode uses placeholder events.';
      badge = 'Placeholder (not real data)';
    } else {
      text = `Live NASA feed unavailable. The game uses archived NASA records (retrieved ${date}).`;
      badge = `Archived (retrieved ${date})`;
    }
  }

  return (
    <div className="live-banner" aria-live="polite" data-status={live.status}>
      {text && (
        <div className="container live-banner-inner">
          <p className="live-banner-text">{text}</p>
          <span className={`live-badge live-badge-${kind}`}>{badge}</span>
        </div>
      )}
    </div>
  );
}

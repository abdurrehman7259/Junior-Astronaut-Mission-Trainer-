import { useId } from 'react';
import { isStubEvent } from '../../app/stub-events';
import type { Severity, SolarEvent, SolarEventKind } from '../../shared/types';
import { BoltIcon, CheckIcon, InfoIcon, SunIcon } from './icons';
import './EventCard.css';

export interface EventCardProps {
  event: SolarEvent;
  /** Mission day this event hits. */
  day: number;
  /** Optional override of event.kidText (the F7 copy layer). */
  kidText?: string;
  /** "sol" on Mars. Default "day". */
  dayWord?: 'day' | 'sol';
}

export const KIND_WORDS: Record<SolarEventKind, string> = {
  FLR: 'Solar flare',
  CME: 'Solar storm cloud (CME)',
  QUIET: 'Quiet Sun day',
};

/** Kind label for the given site word ("Quiet Sun day" or "Quiet Sun sol"). */
export function kindWordFor(kind: SolarEventKind, dayWord: 'day' | 'sol' = 'day'): string {
  return kind === 'QUIET' ? `Quiet Sun ${dayWord}` : KIND_WORDS[kind];
}

export const SEVERITY_WORDS: Record<Severity, string> = {
  0: 'Calm',
  1: 'Small',
  2: 'Medium',
  3: 'Big',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "2024-05-10" -> "10 May 2024" (UTC, so the day never shifts with the viewer's time zone). */
export function formatRealDate(realDate: string): string {
  const d = new Date(`${realDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? realDate : DATE_FORMAT.format(d);
}

function detailOf(event: SolarEvent): string | null {
  if (event.kind === 'FLR' && event.flareClass) return `Class ${event.flareClass}`;
  if (event.kind === 'CME' && event.cmeSpeedKms !== undefined) {
    return `${event.cmeSpeedKms.toLocaleString('en-GB')} km/s`;
  }
  return null;
}

export function EventCard({ event, day, kidText, dayWord = 'day' }: EventCardProps) {
  const headingId = useId();
  const stub = isStubEvent(event);
  const detail = detailOf(event);
  const badge = stub ? 'Placeholder' : event.kind === 'QUIET' ? 'Real quiet day' : 'Real event';

  return (
    <section className="event-card card" aria-labelledby={headingId}>
      <h2 id={headingId} className="event-card-title">
        <SunIcon className="event-card-title-icon" />
        <span>
          {dayWord === 'sol' ? 'Sol' : 'Day'} {day} space weather
        </span>
      </h2>

      <p className={`event-badge ${stub ? 'is-stub' : 'is-real'}`}>
        {stub ? <InfoIcon size={20} /> : <CheckIcon size={20} />}
        <span>{badge}</span>
      </p>

      <dl className="event-facts">
        <div className="event-fact">
          <dt>What</dt>
          <dd className="event-kind">{kindWordFor(event.kind, dayWord)}</dd>
        </div>
        <div className="event-fact">
          <dt>{stub ? 'Placeholder date:' : 'Real date:'}</dt>
          <dd>{formatRealDate(event.realDate)}</dd>
        </div>
        <div className="event-fact">
          <dt>Strength</dt>
          <dd className="event-severity">
            <span className="pips" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <BoltIcon key={n} size={22} filled={n <= event.severity} className={n <= event.severity ? 'pip pip-on' : 'pip'} />
              ))}
            </span>
            <span className="event-severity-word">{SEVERITY_WORDS[event.severity]}</span>
            {detail && <span className="event-detail">{detail}</span>}
          </dd>
        </div>
      </dl>

      <p className="event-text">{kidText ?? event.kidText}</p>

      {dayWord === 'sol' && event.marsImpact === 'listed' && (
        <p className="event-mars-note">NASA's model predicted this storm would reach Mars.</p>
      )}
      {dayWord === 'sol' && event.marsImpact === 'game-only' && (
        <p className="event-mars-note">Recorded by NASA. In the game, this storm also reaches Mars.</p>
      )}

      <a className="event-link" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
        See the NASA record
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </section>
  );
}

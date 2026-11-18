import { useId, useState } from 'react';
import { isStubEvent } from '../../app/stub-events.js';

import { EVENT, EVENT_EXTRA } from '../content/copy.js';
import { GlossaryTerm } from './GlossaryTerm.jsx';
import { BoltIcon, CheckIcon, InfoIcon, SunIcon, WarningIcon } from './icons.jsx';

/** Kid words for each kind. The calm-day word gets "day" or "sol" added by kindWordFor. */
export const KIND_WORDS = {
  FLR: EVENT.kind.FLR,
  CME: EVENT.kind.CME,
  QUIET: `${EVENT.kind.QUIET} day`,
};

/** Kind label for the given site word ("Calm Sun day" or "Calm Sun sol"). */
export function kindWordFor(kind, dayWord = 'day') {
  return kind === 'QUIET' ? `${EVENT.kind.QUIET} ${dayWord}` : KIND_WORDS[kind];
}

/** Storm size words: None / Small / Medium / Big. */
export const SEVERITY_WORDS = EVENT.sizes;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "2024-05-10" -> "10 May 2024" (UTC, so the day never shifts with the viewer's time zone). */
export function formatRealDate(realDate) {
  const d = new Date(`${realDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? realDate : DATE_FORMAT.format(d);
}

/** The numbers (flare class, CME speed) that live behind "More details". */
function detailOf(event) {
  if (event.kind === 'FLR' && event.flareClass) return EVENT.flareClass(event.flareClass);
  if (event.kind === 'CME' && event.cmeSpeedKms !== undefined) {
    return EVENT.cmeSpeed(event.cmeSpeedKms.toLocaleString('en-GB'));
  }
  return null;
}

export function EventCard({ event, day, kidText, dayWord = 'day' }) {
  const headingId = useId();
  const detailsId = useId();
  const [showDetails, setShowDetails] = useState(false);
  const stub = isStubEvent(event);
  const detail = detailOf(event);
  const storm = !stub && event.kind !== 'QUIET';
  const badge = stub ? EVENT.badgePlaceholder : event.kind === 'QUIET' ? EVENT.badgeCalm(dayWord) : EVENT.badgeStorm;

  return (
    <section className="event-card card" aria-labelledby={headingId}>
      <div className="event-card-head">
        <h2 id={headingId} className="event-card-title">
          <SunIcon className="event-card-title-icon" />
          <span>{EVENT.title(dayWord, day)}</span>
        </h2>
        <p className={`event-badge ${stub ? 'is-stub' : storm ? 'is-storm' : 'is-real'}`}>
          {stub ? <InfoIcon size={20} /> : storm ? <WarningIcon size={20} /> : <CheckIcon size={20} />}
          <span>{badge}</span>
        </p>
      </div>

      <dl className="event-facts">
        <div className="event-fact">
          <dt>What</dt>
          <dd className="event-kind">
            {event.kind === 'FLR' && <GlossaryTerm k="solarFlare">{EVENT.kind.FLR}</GlossaryTerm>}
            {event.kind === 'CME' && <GlossaryTerm k="cme">{EVENT.kind.CME}</GlossaryTerm>}
            {event.kind === 'QUIET' && kindWordFor('QUIET', dayWord)}
          </dd>
        </div>
        <div className="event-fact">
          <dt>{stub ? EVENT_EXTRA.placeholderDate : EVENT.realDate}</dt>
          <dd>{formatRealDate(event.realDate)}</dd>
        </div>
        {event.severity > 0 && (
          <div className="event-fact">
            <dt>{EVENT.stormSize}</dt>
            <dd className="event-severity">
              <span className="pips" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <BoltIcon
                    key={n}
                    size={20}
                    filled={n <= event.severity}
                    className={n <= event.severity ? 'pip pip-on' : 'pip'}
                  />
                ))}
              </span>
              <span className="event-severity-word">{SEVERITY_WORDS[event.severity]}</span>
            </dd>
          </div>
        )}
      </dl>

      <p className="event-text">{kidText ?? event.kidText}</p>

      {dayWord === 'sol' && event.marsImpact === 'listed' && <p className="event-mars-note">{EVENT.marsListed}</p>}
      {dayWord === 'sol' && event.marsImpact === 'game-only' && <p className="event-mars-note">{EVENT.marsGameOnly}</p>}

      {detail && showDetails && (
        <p id={detailsId} className="event-detail">
          {detail}
        </p>
      )}

      <div className="event-actions">
        {detail && (
          <button
            type="button"
            className="btn btn-secondary event-more"
            aria-expanded={showDetails}
            aria-controls={showDetails ? detailsId : undefined}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? EVENT.fewerDetails : EVENT.moreDetails}
          </button>
        )}
        <a className="event-link" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
          {EVENT.nasaLink}
          <span className="visually-hidden"> {EVENT_EXTRA.newTab}</span>
        </a>
      </div>
    </section>
  );
}

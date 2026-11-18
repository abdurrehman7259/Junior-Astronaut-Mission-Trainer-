import { useId } from 'react';

import { EARTH_EXTRA, EARTH_MSG } from '../content/copy.js';
import { formatRealDate, kindWordFor } from './EventCard.jsx';
import { GlossaryTerm } from './GlossaryTerm.jsx';

/** Simple antenna with radio waves. Original, decorative. */
function AntennaIcon({ size = 40 }) {
  return (
    <svg
      className="earth-msg-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 14V28" />
      <path d="M11 28H21" />
      <circle cx="16" cy="11" r="2" />
      <path d="M10.5 6.5C8.2 9 8.2 13 10.5 15.5" />
      <path d="M21.5 6.5C23.8 9 23.8 13 21.5 15.5" />
      <path d="M6.5 3.5C2.5 8 2.5 14 6.5 18.5" />
      <path d="M25.5 3.5C29.5 8 29.5 14 25.5 18.5" />
    </svg>
  );
}

/** The light-time source in mars-site.json: the source whose title names the light time. */
function lightTimeSource(site) {
  return site?.sources.find((s) => /light[- ]?time/i.test(s.title)) ?? null;
}

/**
 * Mars only (D-023): the storm warning from Earth arrives one sol late, so today's real event stays
 * hidden while the player plans. Static card, no live region.
 */
export function EarthMessage({ marsSite = null, yesterday = null }) {
  const headingId = useId();
  const source = lightTimeSource(marsSite);
  const range = marsSite?.lightTimeMinutes;

  // "sol" in the rule line is an inline glossary term (the first place a Mars player meets the word).
  const [ruleBefore, ruleAfter] = EARTH_MSG.rule.split('sol');

  return (
    <section className="earth-msg card" aria-labelledby={headingId}>
      <div className="earth-msg-head">
        <h2 id={headingId} className="earth-msg-title">
          <AntennaIcon size={32} />
          <span>{EARTH_MSG.title}</span>
        </h2>
        <p className="earth-msg-status">{EARTH_MSG.status}</p>
      </div>

      <ul className="earth-msg-list">
        <li>
          <span className="earth-msg-tag">{EARTH_MSG.realFact}</span>{' '}
          {range ? EARTH_MSG.radio(range.min, range.max) : EARTH_MSG.radioNoNumbers}{' '}
          {source && (
            <a className="earth-msg-link" href={source.url} target="_blank" rel="noopener noreferrer">
              {EARTH_EXTRA.source}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
        </li>
        <li>
          <span className="earth-msg-tag">{EARTH_MSG.gameRule}</span> {ruleBefore}
          <GlossaryTerm k="sol">sol</GlossaryTerm>
          {ruleAfter} {EARTH_EXTRA.radioFaster}
        </li>
        <li>{EARTH_MSG.plan}</li>
      </ul>

      {yesterday && (
        <p className="earth-msg-yesterday">
          {EARTH_MSG.yesterday} {kindWordFor(yesterday.kind, 'sol')}, {formatRealDate(yesterday.realDate)}
        </p>
      )}
    </section>
  );
}

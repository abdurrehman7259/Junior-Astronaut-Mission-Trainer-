import type { ReactNode } from 'react';
import type { SiteId, TurnResult } from '../../shared/types';
import { isStubEvent } from '../../app/stub-events';
import { EventCard, SEVERITY_WORDS, formatRealDate, kindWordFor } from '../components/EventCard';
import { kidTextFor } from '../content/eventCopy';
import { BatteryIcon, FlaskIcon, HeartIcon, InfoIcon, LeafIcon, RadiationIcon } from '../components/icons';
import { ScreenHeading } from '../components/ScreenHeading';
import './ResolutionScreen.css';

export interface ResolutionScreenProps {
  result: TurnResult;
  /** True when result.statusAfter !== 'playing'. */
  isFinal: boolean;
  /** "Next day" (or "See how the mission went" when isFinal). */
  onContinue: () => void;
  /** "mars": Sol wording, and today's hidden event is revealed here. Default "moon". */
  site?: SiteId;
}

interface RowProps {
  className: string;
  icon: ReactNode;
  label: string;
  before: number;
  after: number;
  explanation: string;
}

function Arrow({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="res-arrow res-up">
        <span aria-hidden="true">▲</span>
        <span className="visually-hidden">Up</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="res-arrow res-down">
        <span aria-hidden="true">▼</span>
        <span className="visually-hidden">Down</span>
      </span>
    );
  }
  return (
    <span className="res-arrow res-same">
      <span aria-hidden="true">●</span>
      <span className="visually-hidden">No change</span>
    </span>
  );
}

function Row({ className, icon, label, before, after, explanation }: RowProps) {
  return (
    <li className={`res-row ${className}`}>
      <div className="res-row-head">
        <span className="res-icon">{icon}</span>
        <span className="res-label">{label}</span>
        <Arrow delta={after - before} />
        <span className="res-numbers">
          <span aria-hidden="true">{`${before} → ${after}`}</span>
          <span className="visually-hidden">{`from ${before} to ${after}`}</span>
        </span>
      </div>
      <p className="res-explain">{explanation}</p>
    </li>
  );
}

export function ResolutionScreen({ result, isFinal, onContinue, site = 'moon' }: ResolutionScreenProps) {
  const { event, before, after, explanations, dose } = result;
  const isMars = site === 'mars';
  const dayWord = isMars ? 'sol' : 'day';
  return (
    <section className="resolution">
      <ScreenHeading>
        {isMars ? 'Sol' : 'Day'} {result.day} report
      </ScreenHeading>

      {isMars ? (
        <>
          <p className="res-reveal">
            <InfoIcon className="res-reveal-icon" />
            <span>
              Message from Earth arrived: {kindWordFor(event.kind, 'sol')} on {formatRealDate(event.realDate)}
            </span>
          </p>
          <EventCard
            event={event}
            day={result.day}
            dayWord="sol"
            kidText={isStubEvent(event) ? undefined : kidTextFor(event, site)}
          />
          {event.severity >= 1 && (
            <p className="res-late">In this game, the warning came too late. Far from Earth, crews plan ahead!</p>
          )}
        </>
      ) : (
        <p className="res-recap">
          <span className="res-recap-kind">{kindWordFor(event.kind)}</span>
          <span aria-hidden="true"> · </span>
          <span>{formatRealDate(event.realDate)}</span>
          <span aria-hidden="true"> · </span>
          <span>Game strength: {SEVERITY_WORDS[event.severity]}</span>
        </p>
      )}

      <div className="card res-card">
        <h2 className="visually-hidden">What changed</h2>
        <ul className="res-list">
          <Row
            className="res-power"
            icon={<BatteryIcon />}
            label="Power reserve"
            before={before.power}
            after={after.power}
            explanation={explanations.power}
          />
          <Row
            className="res-life"
            icon={<LeafIcon />}
            label="Life support"
            before={before.lifeSupport}
            after={after.lifeSupport}
            explanation={explanations.lifeSupport}
          />
          <Row
            className="res-crew"
            icon={<HeartIcon />}
            label="Crew health"
            before={before.crewHealth}
            after={after.crewHealth}
            explanation={explanations.crewHealth}
          />
          <Row
            className="res-science"
            icon={<FlaskIcon />}
            label="Science"
            before={result.scienceBefore}
            after={result.scienceAfter}
            explanation={explanations.science}
          />
        </ul>

        {dose.received > 0 && (
          <p className="res-dose">
            <RadiationIcon className="res-dose-icon" />
            <span>
              Radiation that reached the crew: {dose.received} (your shield blocked {dose.blocked})
            </span>
            <span className="res-game-note">Game numbers</span>
          </p>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-large res-continue" onClick={onContinue}>
        {isFinal ? 'See how the mission went' : `Next ${dayWord}`}
      </button>
    </section>
  );
}

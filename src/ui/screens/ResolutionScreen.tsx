import type { ReactNode } from 'react';
import type { SiteId, TurnResult } from '../../shared/types';
import { isStubEvent } from '../../app/stub-events';
import { meterLinesFor, verdictFor, type MeterLineKind } from '../../app/verdict';
import { EventCard, SEVERITY_WORDS, formatRealDate, kindWordFor } from '../components/EventCard';
import {
  BatteryIcon,
  CheckIcon,
  FlaskIcon,
  HeartIcon,
  InfoIcon,
  LeafIcon,
  WarningIcon,
} from '../components/icons';
import { ScreenHeading } from '../components/ScreenHeading';
import {
  EVENT,
  NAMES,
  REPORT,
  REPORT_LINES,
  REPORT_MORE,
  VERDICT_TEXT,
  VERDICT_TONE,
  type DayWord,
} from '../content/copy';
import { kidTextFor } from '../content/eventCopy';
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
  line: string;
  tag?: string;
}

function Arrow({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="res-arrow res-up">
        <span aria-hidden="true">▲</span>
        <span className="visually-hidden">{REPORT_MORE.arrowUp}</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="res-arrow res-down">
        <span aria-hidden="true">▼</span>
        <span className="visually-hidden">{REPORT_MORE.arrowDown}</span>
      </span>
    );
  }
  return (
    <span className="res-arrow res-same">
      <span aria-hidden="true">●</span>
      <span className="visually-hidden">{REPORT_MORE.arrowSame}</span>
    </span>
  );
}

function Row({ className, icon, label, before, after, line, tag }: RowProps) {
  return (
    <li className={`res-row ${className}`}>
      <div className="res-row-head">
        <span className="res-icon">{icon}</span>
        <span className="res-label">{label}</span>
        <Arrow delta={after - before} />
        <span className="res-numbers">
          <span aria-hidden="true">{`${before} → ${after}`}</span>
          <span className="visually-hidden">{REPORT_MORE.fromTo(before, after)}</span>
        </span>
      </div>
      <p className="res-line">
        <span>{line}</span>
        {tag && <span className="res-game-note">{tag}</span>}
      </p>
    </li>
  );
}

function lineText(line: MeterLineKind, dayWord: DayWord, isFinal: boolean): { text: string; tag?: string } {
  switch (line.meter) {
    case 'battery':
      return {
        text: {
          empty: REPORT_LINES.batteryEmpty,
          down: REPORT_LINES.batteryDown,
          up: REPORT_LINES.batteryUp,
          same: REPORT_LINES.batterySame,
        }[line.kind],
      };
    case 'air':
      return {
        text:
          line.kind === 'short'
            ? REPORT_LINES.airShort(line.units, REPORT_MORE.airWhen(dayWord, isFinal))
            : line.kind === 'shortDown'
              ? REPORT_LINES.airShortDown(line.units, REPORT_MORE.airWhen(dayWord, isFinal))
              : { down: REPORT_LINES.airDown, up: REPORT_LINES.airUp, same: REPORT_LINES.airSame }[line.kind],
      };
    case 'crew':
      return line.kind === 'hurt'
        ? { text: REPORT_LINES.crewHurt(line.blocked, line.received), tag: REPORT_LINES.gameNumbers }
        : { text: line.kind === 'safe' ? REPORT_LINES.crewSafe : REPORT_LINES.crewCalm };
    case 'science':
      return { text: line.kind === 'points' ? REPORT_LINES.science(line.points) : REPORT_LINES.noScience };
  }
}

export function ResolutionScreen({ result, isFinal, onContinue, site = 'moon' }: ResolutionScreenProps) {
  const { event, before, after } = result;
  const isMars = site === 'mars';
  const dayWord: DayWord = isMars ? 'sol' : 'day';

  const verdict = verdictFor(result, site);
  const tone = VERDICT_TONE[verdict];
  const ToneIcon = tone === 'good' ? CheckIcon : tone === 'ok' ? InfoIcon : WarningIcon;

  const [battery, air, crew, science] = meterLinesFor(result).map((l) => lineText(l, dayWord, isFinal));

  return (
    <section className="resolution">
      <ScreenHeading>{REPORT.heading(dayWord, result.day)}</ScreenHeading>

      <p className={`res-verdict res-verdict-${tone}`}>
        <ToneIcon className="res-verdict-icon" />
        <span className="res-verdict-body">
          <span className="res-verdict-tone">{REPORT_MORE.toneWord[tone]}</span>
          <span className="res-verdict-text">{VERDICT_TEXT[verdict](dayWord)}</span>
        </span>
      </p>

      <div className="card res-card">
        <h2 className="visually-hidden">{REPORT_MORE.meterListLabel}</h2>
        <ul className="res-list">
          <Row
            className="res-power"
            icon={<BatteryIcon />}
            label={NAMES.battery}
            before={before.power}
            after={after.power}
            line={battery.text}
          />
          <Row
            className="res-life"
            icon={<LeafIcon />}
            label={NAMES.air}
            before={before.lifeSupport}
            after={after.lifeSupport}
            line={air.text}
          />
          <Row
            className="res-crew"
            icon={<HeartIcon />}
            label={NAMES.crew}
            before={before.crewHealth}
            after={after.crewHealth}
            line={crew.text}
            tag={crew.tag}
          />
          <Row
            className="res-science"
            icon={<FlaskIcon />}
            label={NAMES.science}
            before={result.scienceBefore}
            after={result.scienceAfter}
            line={science.text}
          />
        </ul>
      </div>

      {isMars ? (
        <>
          <p className="res-reveal">
            <InfoIcon className="res-reveal-icon" />
            <span>
              {REPORT.marsArrived} {kindWordFor(event.kind, 'sol')} on {formatRealDate(event.realDate)}
            </span>
          </p>
          <EventCard
            event={event}
            day={result.day}
            dayWord="sol"
            kidText={isStubEvent(event) ? undefined : kidTextFor(event, site)}
          />
          {event.severity >= 1 && <p className="res-late">{REPORT_MORE.marsLateShort}</p>}
        </>
      ) : (
        <p className="res-recap">
          <span className="res-recap-kind">{kindWordFor(event.kind)}</span>
          <span aria-hidden="true"> · </span>
          <span>{formatRealDate(event.realDate)}</span>
          <span aria-hidden="true"> · </span>
          <span>{`${EVENT.stormSize} ${SEVERITY_WORDS[event.severity]}`}</span>
        </p>
      )}

      <div className="res-actions">
        <button type="button" className="btn btn-primary btn-large res-continue" onClick={onContinue}>
          {isFinal ? REPORT.final : REPORT_MORE.goTo(dayWord, result.day + 1)}
        </button>
      </div>
    </section>
  );
}

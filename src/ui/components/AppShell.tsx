import type { ReactNode, RefObject } from 'react';
import { dayWordCap } from '../../app/state';
import { MISSION_DAYS, type SiteId } from '../../shared/types';
import { HEADER, type DayWord } from '../content/copy';

interface Props {
  day: number | null;
  site?: SiteId;
  isPlaceholder: boolean;
  onOpenData: () => void;
  dataButtonRef: RefObject<HTMLButtonElement | null>;
  /** Permanent goal line. science is null on the start screen. */
  goal: { site: SiteId; science: number | null };
  onOpenHowTo: () => void;
  howToButtonRef: RefObject<HTMLButtonElement | null>;
  /** Optional strip directly under the header (live banner). */
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  day,
  site = 'moon',
  isPlaceholder,
  onOpenData,
  dataButtonRef,
  goal,
  onOpenHowTo,
  howToButtonRef,
  banner,
  children,
}: Props) {
  const goalDayWord: DayWord = goal.site === 'mars' ? 'sol' : 'day';
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="app-brand">
            <p className="app-title">
              <strong>Moon Base Cadets</strong>
            </p>
            <p className="app-goal">{HEADER.goal(MISSION_DAYS, goalDayWord, goal.science)}</p>
          </div>
          <div className="app-header-actions">
            {day !== null && (
              <span className="day-indicator">
                {dayWordCap(site)} {day} of {MISSION_DAYS}
              </span>
            )}
            <button ref={howToButtonRef} type="button" className="btn btn-secondary" onClick={onOpenHowTo}>
              {HEADER.howToPlay}
            </button>
            <button ref={dataButtonRef} type="button" className="btn btn-secondary" onClick={onOpenData}>
              {HEADER.dataUsed}
            </button>
          </div>
        </div>
      </header>
      {banner}
      {isPlaceholder && (
        <div className="dev-banner" role="status">
          Dev mode: placeholder events, not real data.
        </div>
      )}
      <main id="main" className="container app-main">
        {children}
      </main>
      <footer className="app-footer">
        <div className="container">
          <p>
            Solar events are real NASA DONKI records. Game numbers are game rules, not real measurements.
          </p>
        </div>
      </footer>
    </>
  );
}

import type { ReactNode, RefObject } from 'react';
import { MISSION_DAYS } from '../../shared/types';

interface Props {
  day: number | null;
  isPlaceholder: boolean;
  onOpenData: () => void;
  dataButtonRef: RefObject<HTMLButtonElement | null>;
  /** Optional strip directly under the header (live banner). */
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShell({ day, isPlaceholder, onOpenData, dataButtonRef, banner, children }: Props) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="container app-header-inner">
          <div>
            <p className="app-title">
              <strong>Moon Base Cadets</strong>
            </p>
            <p className="app-tagline">Run a Moon base. Survive real solar storms.</p>
          </div>
          <div className="app-header-actions">
            {day !== null && (
              <span className="day-indicator">
                Day {day} of {MISSION_DAYS}
              </span>
            )}
            <button ref={dataButtonRef} type="button" className="btn btn-secondary" onClick={onOpenData}>
              Data used
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

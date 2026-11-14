import { useState, type FormEvent } from 'react';
import { ScreenHeading } from '../components/ScreenHeading';
import { CREW_NAME_MAX, DEFAULT_CREW_NAME, loadCrewName, sanitizeCrewName, saveCrewName } from './crewName';
import './StartScreen.css';

function MoonBaseArt() {
  return (
    <svg className="start-art" viewBox="0 0 320 160" aria-hidden="true" focusable="false">
      <circle cx="250" cy="34" r="18" fill="var(--color-text-muted)" />
      <circle cx="40" cy="30" r="2" fill="var(--color-text)" />
      <circle cx="110" cy="18" r="2" fill="var(--color-text)" />
      <circle cx="180" cy="44" r="2" fill="var(--color-text)" />
      <circle cx="290" cy="80" r="2" fill="var(--color-text)" />
      <path d="M0 130 Q80 100 160 118 T320 108 V160 H0 Z" fill="var(--color-surface-2)" />
      <path d="M0 130 Q80 100 160 118 T320 108" fill="none" stroke="var(--color-border)" strokeWidth="2" />
      <path d="M110 126 A40 40 0 0 1 190 126 Z" fill="var(--color-surface)" stroke="var(--color-link)" strokeWidth="3" />
      <rect x="140" y="106" width="20" height="20" rx="3" fill="var(--color-accent)" />
      <rect x="196" y="112" width="4" height="16" fill="var(--color-border)" />
      <path d="M200 112 L240 112 L230 98 L190 98 Z" fill="var(--color-shield)" stroke="var(--color-border)" strokeWidth="2" />
    </svg>
  );
}

export interface StartResume {
  day: number;
  crewName: string;
  onResume: () => void;
}

export function StartScreen({ onStart, resume }: { onStart: (crewName: string) => void; resume?: StartResume }) {
  const [name, setName] = useState(() => loadCrewName());

  const start = (event?: FormEvent) => {
    event?.preventDefault();
    const finalName = sanitizeCrewName(name).trim() || DEFAULT_CREW_NAME;
    saveCrewName(finalName === DEFAULT_CREW_NAME && !name.trim() ? '' : finalName);
    onStart(finalName);
  };

  return (
    <section className="start-screen">
      <div className="start-copy stack">
        <ScreenHeading>Moon Base Cadets</ScreenHeading>
        <p className="start-tagline">Run a Moon base. Survive real solar storms.</p>
        <p>Your crew lives at a base near the Moon&apos;s south pole.</p>
        <p>Each day, share 10 power units between Life support, Shielding and Science.</p>
        <p>Real solar storms from NASA records will hit. Be ready!</p>

        {resume && (
          <div className="start-resume stack">
            <button type="button" className="btn btn-primary btn-large start-button" onClick={resume.onResume}>
              Continue mission (Day {resume.day})
            </button>
            <p>Crew {resume.crewName} is waiting at the base.</p>
          </div>
        )}

        <form className="start-form" onSubmit={start}>
          <label htmlFor="crew-name" className="start-label">
            Crew name (optional)
          </label>
          <input
            id="crew-name"
            className="start-input"
            type="text"
            maxLength={CREW_NAME_MAX}
            autoComplete="off"
            value={name}
            aria-describedby="crew-name-hint crew-name-count"
            onChange={(e) => setName(sanitizeCrewName(e.target.value))}
          />
          <p className="start-hint">
            <span id="crew-name-hint">Stays on this device only.</span>{' '}
            <span id="crew-name-count">
              {name.length}/{CREW_NAME_MAX}
            </span>
          </p>
          <button type="submit" className={`btn btn-large start-button ${resume ? 'btn-secondary' : 'btn-primary'}`}>
            {resume ? 'New mission' : 'Start mission'}
          </button>
        </form>
      </div>
      <MoonBaseArt />
    </section>
  );
}

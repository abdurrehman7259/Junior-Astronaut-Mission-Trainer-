import { useState, type FormEvent } from 'react';
import { SITE_IDS, SITES } from '../../shared/sites';
import type { SiteId } from '../../shared/types';
import { dayWordCap } from '../../app/state';
import { CheckIcon } from '../components/icons';
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

const SITE_BLURB: Record<SiteId, string> = {
  moon: "Run a base near the Moon's south pole. Mission Control warns you before each storm.",
  mars: 'Run a base in Jezero Crater on Mars. Storm warnings from Earth arrive a sol late.',
};

function SiteIcon({ site }: { site: SiteId }) {
  return (
    <svg className="site-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {site === 'moon' ? (
        <>
          <circle cx="24" cy="24" r="20" fill="#b4b8c6" stroke="var(--color-text)" strokeWidth="2" />
          <circle cx="17" cy="18" r="4" fill="#8d92a3" />
          <circle cx="30" cy="30" r="5" fill="#8d92a3" />
          <circle cx="31" cy="15" r="2.5" fill="#8d92a3" />
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="20" fill="#c1502e" stroke="var(--color-text)" strokeWidth="2" />
          <path d="M8 28 Q24 20 40 30" fill="none" stroke="#8f3a20" strokeWidth="3" />
          <circle cx="18" cy="16" r="3.5" fill="#9c3f22" />
          <circle cx="32" cy="34" r="3" fill="#9c3f22" />
        </>
      )}
    </svg>
  );
}

export type MarsStatus = 'loading' | 'ready' | 'unavailable';

export interface StartResume {
  site?: SiteId;
  day: number;
  crewName: string;
  onResume: () => void;
}

export function StartScreen({
  onStart,
  resume,
  marsStatus = 'unavailable',
}: {
  onStart: (crewName: string, site: SiteId) => void;
  resume?: StartResume;
  marsStatus?: MarsStatus;
}) {
  const [name, setName] = useState(() => loadCrewName());
  const [picked, setPicked] = useState<SiteId>('moon');
  const site: SiteId = picked === 'mars' && marsStatus !== 'ready' ? 'moon' : picked;

  const start = (event?: FormEvent) => {
    event?.preventDefault();
    const finalName = sanitizeCrewName(name).trim() || DEFAULT_CREW_NAME;
    saveCrewName(finalName === DEFAULT_CREW_NAME && !name.trim() ? '' : finalName);
    onStart(finalName, site);
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
              {resume.site === 'mars' ? 'Continue Mars mission' : 'Continue mission'} ({dayWordCap(resume.site ?? 'moon')} {resume.day})
            </button>
            <p>Crew {resume.crewName} is waiting at the base.</p>
          </div>
        )}

        <form className="start-form" onSubmit={start}>
          <div role="radiogroup" aria-labelledby="site-picker-label" className="site-picker">
            <p id="site-picker-label" className="start-label">
              Choose your base
            </p>
            {SITE_IDS.map((id) => {
              const disabled = id === 'mars' && marsStatus !== 'ready';
              const note =
                id === 'mars' && marsStatus === 'unavailable'
                  ? 'Coming soon'
                  : id === 'mars' && marsStatus === 'loading'
                    ? 'Loading Mars data…'
                    : null;
              return (
                <label key={id} className={`site-card${site === id ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
                  <input
                    type="radio"
                    name="site"
                    value={id}
                    className="site-radio"
                    checked={site === id}
                    disabled={disabled}
                    aria-labelledby={`site-${id}-name`}
                    aria-describedby={`site-${id}-desc`}
                    onChange={() => setPicked(id)}
                  />
                  <span className="site-dot" aria-hidden="true" />
                  <SiteIcon site={id} />
                  <span className="site-text">
                    <span className="site-head">
                      <strong id={`site-${id}-name`}>{SITES[id].name}</strong>
                      <span className="site-selected" aria-hidden="true">
                        <CheckIcon size={18} />
                        Selected
                      </span>
                    </span>
                    <span id={`site-${id}-desc`} className="site-desc">
                      {SITE_BLURB[id]}
                    </span>
                    {note && <span className="site-note">{note}</span>}
                  </span>
                </label>
              );
            })}
          </div>
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

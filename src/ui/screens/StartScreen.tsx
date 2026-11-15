import { useState, type FormEvent } from 'react';
import { SITE_IDS, SITES } from '../../shared/sites';
import type { SiteId } from '../../shared/types';
import { CheckIcon, WarningIcon } from '../components/icons';
import { ScreenHeading } from '../components/ScreenHeading';
import { START, START_END } from '../content/copy';
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
        <ScreenHeading>{START.title}</ScreenHeading>
        <p className="start-tagline">{START.tagline}</p>
        <p className="start-goal">{START.goal}</p>

        {resume && <p className="start-waiting">{START.crewWaiting(resume.crewName)}</p>}

        <form className="start-form" onSubmit={start}>
          <div role="radiogroup" aria-labelledby="site-picker-label" className="site-picker">
            <p id="site-picker-label" className="start-label">
              {START.chooseBase}
            </p>
            {SITE_IDS.map((id) => {
              const disabled = id === 'mars' && marsStatus !== 'ready';
              const note =
                id === 'mars' && marsStatus === 'unavailable'
                  ? START_END.comingSoon
                  : id === 'mars' && marsStatus === 'loading'
                    ? START_END.loadingMars
                    : null;
              const hard = id === 'mars';
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
                    aria-describedby={`site-${id}-badge site-${id}-desc`}
                    onChange={() => setPicked(id)}
                  />
                  <span className="site-dot" aria-hidden="true" />
                  <SiteIcon site={id} />
                  <span className="site-text">
                    <span className="site-head">
                      <strong id={`site-${id}-name`}>{SITES[id].name}</strong>
                      <span id={`site-${id}-badge`} className={`site-badge ${hard ? 'is-hard' : 'is-easy'}`}>
                        {hard ? <WarningIcon size={16} /> : <CheckIcon size={16} />}
                        <span className="visually-hidden">{START_END.badgeLabel} </span>
                        {hard ? START.siteBadgeHard : START.siteBadgeEasy}
                      </span>
                      <span className="site-selected" aria-hidden="true">
                        <CheckIcon size={18} />
                        {START_END.selected}
                      </span>
                    </span>
                    <span id={`site-${id}-desc`} className="site-desc">
                      {hard ? START.siteHard : START.siteEasy}
                    </span>
                    {note && <span className="site-note">{note}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <label htmlFor="crew-name" className="start-label">
            {START.crewLabel}
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
            <span id="crew-name-hint">{START.crewHint}</span>{' '}
            <span id="crew-name-count">
              {name.length}/{CREW_NAME_MAX}
            </span>
          </p>
          <div className="start-bar">
            {resume && (
              <button type="button" className="btn btn-primary btn-large start-button" onClick={resume.onResume}>
                {START.continue(resume.site ?? 'moon', SITES[resume.site ?? 'moon'].dayWord, resume.day)}
              </button>
            )}
            <button type="submit" className={`btn btn-large start-button ${resume ? 'btn-secondary' : 'btn-primary'}`}>
              {resume ? START.newMission : START.start}
            </button>
          </div>
        </form>
      </div>
      <MoonBaseArt />
    </section>
  );
}

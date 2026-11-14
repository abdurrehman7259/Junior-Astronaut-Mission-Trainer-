import type { GameState, ScienceFact, TurnResult } from '../../shared/types';
import { siteOf } from '../../shared/eventSet';
import { SITES } from '../../shared/sites';
import { dayWordCap } from '../../app/state';
import { isStubEvent } from '../../app/stub-events';
import { ScreenHeading } from '../components/ScreenHeading';
import { Meters } from '../components/Meters';
import { formatRealDate, kindWordFor, SEVERITY_WORDS } from '../components/EventCard';
import './EndScreen.css';

export interface EndScreenProps {
  game: GameState;
  crewName: string;
  onPlayAgain: () => void;
  /** One real OSDR study for this mission, or null if facts failed to load. */
  fact?: ScienceFact | null;
}

/** One reflection line chosen from the played days (FR-10). Pure. */
export function pickReflection(history: TurnResult[]): string {
  const hurtOnStorm = history.some(
    (r) => r.event.kind !== 'QUIET' && r.deltas.crewHealth < 0 && r.allocation.shield < 3,
  );
  if (hurtOnStorm) return 'Tip: more shielding on big storm days protects your crew.';

  const quiet = history.filter((r) => r.event.kind === 'QUIET');
  const noScience = quiet.filter((r) => r.allocation.science === 0).length;
  if (quiet.length > 0 && noScience * 2 > quiet.length) return 'Tip: quiet days are great for science.';

  return 'Great balancing!';
}

function HealthChange({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="debrief-health">
        <span aria-hidden="true">● 0</span>
        <span className="visually-hidden">Crew health: no change</span>
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={`debrief-health ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">
        {up ? '▲' : '▼'} {Math.abs(delta)}
      </span>
      <span className="visually-hidden">
        Crew health {up ? 'went up' : 'went down'} by {Math.abs(delta)}
      </span>
    </span>
  );
}

/** Mission debrief (US-06, FR-09, FR-10). */
export function EndScreen({ game, crewName, onPlayAgain, fact = null }: EndScreenProps) {
  const won = game.status === 'won';
  const site = siteOf(game);
  const Word = dayWordCap(site);

  return (
    <section className="stack end-screen">
      <ScreenHeading>{won ? 'You made it!' : 'Mission Control brings the crew home safely.'}</ScreenHeading>
      <p className="end-outcome">
        {won
          ? `Crew ${crewName} ran the ${SITES[site].name} base for all ${game.history.length} ${SITES[site].dayWord}s.`
          : `Crew ${crewName} kept going for ${game.history.length} ${SITES[site].dayWord}s. Try a new plan next time!`}
      </p>

      <div className="card stack">
        <h2>Final status</h2>
        <Meters meters={game.meters} scienceScore={game.scienceScore} />
      </div>

      <div className="card stack">
        <h2>What really happened</h2>
        <ol className="debrief-list" aria-label={`${Word} by ${SITES[site].dayWord}`}>
          {game.history.map((r) => {
            const stub = isStubEvent(r.event);
            const { life, shield, science } = r.allocation;
            return (
              <li key={r.day} className="debrief-row">
                <p className="debrief-title">
                  <strong>{Word} {r.day}</strong>
                  <span>{kindWordFor(r.event.kind, SITES[site].dayWord)}</span>
                </p>
                <p className="debrief-meta">
                  {formatRealDate(r.event.realDate)}
                  {stub ? ' (placeholder)' : ''} · Game strength: {SEVERITY_WORDS[r.event.severity]}
                </p>
                <p className="debrief-meta">
                  Life {life} · Shield {shield} · Science {science}
                </p>
                <p className="debrief-meta">
                  <HealthChange delta={r.deltas.crewHealth} />
                </p>
                {!stub && (
                  <a className="debrief-link" href={r.event.sourceUrl} target="_blank" rel="noopener noreferrer">
                    See the NASA record<span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
        <p className="debrief-tip">{pickReflection(game.history)}</p>
      </div>

      {fact && (
        <div className="card stack debrief-fact">
          <p className="debrief-label">From NASA&apos;s Open Science Data Repository</p>
          <h2>Real NASA science</h2>
          <p>{fact.text}</p>
          <p className="debrief-meta">Study: {fact.studyTitle}</p>
          <a className="debrief-link" href={fact.osdrUrl} target="_blank" rel="noopener noreferrer">
            Read about this study<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </div>
      )}

      <div className="stack end-actions">
        <button type="button" className="btn btn-primary btn-large" onClick={onPlayAgain}>
          Play again
        </button>
        <p className="debrief-meta">You&apos;ll get a new set of real space weather.</p>
      </div>
    </section>
  );
}

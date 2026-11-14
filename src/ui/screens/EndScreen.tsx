import type { GameState } from '../../shared/types';
import { isStubEvent } from '../../app/stub-events';
import { ScreenHeading } from '../components/ScreenHeading';
import { formatRealDate, KIND_WORDS } from '../components/EventCard';

interface Props {
  game: GameState;
  crewName: string;
  onPlayAgain: () => void;
}

/** Gate 2 end screen (FR-08). The full debrief (F5) replaces the body in stage 2. */
export function EndScreen({ game, crewName, onPlayAgain }: Props) {
  const won = game.status === 'won';
  const storms = game.history.filter((r) => r.event.kind !== 'QUIET');

  return (
    <section className="stack">
      <ScreenHeading>{won ? 'You made it!' : 'Mission Control brings the crew home safely.'}</ScreenHeading>
      <p>
        {won
          ? `Crew ${crewName} ran the Moon base for all ${game.history.length} days.`
          : `Crew ${crewName} kept going for ${game.history.length} days. Try a new plan next time!`}
      </p>
      <p className="end-score">
        Science score: <strong>{game.scienceScore}</strong>
      </p>

      {storms.length > 0 && (
        <div className="card stack">
          <h2>What really happened</h2>
          <ul>
            {storms.map((r) => (
              <li key={r.event.id}>
                Day {r.day}: {KIND_WORDS[r.event.kind]} on {formatRealDate(r.event.realDate)}
                {isStubEvent(r.event) ? ' (placeholder)' : ''}.{' '}
                <a href={r.event.sourceUrl} target="_blank" rel="noopener noreferrer">
                  See the NASA record<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-large" onClick={onPlayAgain}>
        Play again
      </button>
    </section>
  );
}

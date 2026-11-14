import type { GameState } from '../../shared/types';
import { ScreenHeading } from '../components/ScreenHeading';

export function EndScreen({ game, onPlayAgain }: { game: GameState; onPlayAgain: () => void }) {
  return (
    <section className="stack">
      <ScreenHeading>
        {game.status === 'won' ? 'Mission complete!' : 'Mission Control brings the crew home safely.'}
      </ScreenHeading>
      <p>Your science score: {game.scienceScore}</p>
      <button type="button" className="btn btn-primary btn-large" onClick={onPlayAgain}>
        Play again
      </button>
    </section>
  );
}

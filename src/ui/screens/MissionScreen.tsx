import type { Allocation, GameState, TurnResult } from '../../shared/types';
import { MISSION_DAYS } from '../../shared/types';
import { ScreenHeading } from '../components/ScreenHeading';

const SEVERITY_TEXT = ['Quiet day', 'Minor', 'Moderate', 'Strong'] as const;
const KIND_TEXT = { FLR: 'Solar flare', CME: 'Solar cloud (CME)', QUIET: 'Quiet Sun' } as const;
const BALANCED: Allocation = { life: 4, shield: 3, science: 3 };

interface Props {
  game: GameState;
  lastResult: TurnResult | null;
  onPlayDay: (a: Allocation) => void;
}

export function MissionScreen({ game, lastResult, onPlayDay }: Props) {
  const event = game.events[game.day - 1]!;
  const { meters } = game;
  return (
    <section>
      <ScreenHeading>
        Day {game.day} of {MISSION_DAYS}
      </ScreenHeading>
      <div className="mission-grid">
        <div className="card">
          <h2>Today&apos;s space weather</h2>
          <p>Type: {KIND_TEXT[event.kind]}</p>
          <p>Real date: {event.realDate}</p>
          <p>Strength: {SEVERITY_TEXT[event.severity]}</p>
        </div>
        <div className="card">
          <h2>Your base</h2>
          <ul className="meter-list">
            <li>Power reserve: {meters.power}</li>
            <li>Life support: {meters.lifeSupport}</li>
            <li>Crew health: {meters.crewHealth}</li>
            <li>Science score: {game.scienceScore}</li>
          </ul>
          <p />
          <button type="button" className="btn btn-primary" onClick={() => onPlayDay(BALANCED)}>
            Play a balanced day (4/3/3)
          </button>
        </div>
        {lastResult && (
          <div className="card">
            <h2>What happened on day {lastResult.day}</h2>
            <ul className="meter-list">
              <li>{lastResult.explanations.power}</li>
              <li>{lastResult.explanations.lifeSupport}</li>
              <li>{lastResult.explanations.crewHealth}</li>
              <li>{lastResult.explanations.science}</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

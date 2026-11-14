import type { Allocation, GameState, TurnResult } from '../../shared/types';
import { MISSION_DAYS } from '../../shared/types';
import { EventCard } from '../components/EventCard';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { Meters } from '../components/Meters';
import { PowerAllocator } from '../components/PowerAllocator';
import { ScreenHeading } from '../components/ScreenHeading';
import './MissionScreen.css';

interface Props {
  game: GameState;
  crewName: string;
  allocation: Allocation;
  preview: TurnResult | null;
  /** Yesterday's result, for the small change chips on the meters. */
  lastResult: TurnResult | null;
  onAllocationChange: (a: Allocation) => void;
  onConfirm: () => void;
}

const METER_LABEL = { power: 'Power reserve', lifeSupport: 'Life support', crewHealth: 'Crew health' } as const;

export function MissionScreen({ game, crewName, allocation, preview, lastResult, onAllocationChange, onConfirm }: Props) {
  const event = game.events[game.day - 1]!;
  const dueToday = game.carryOver.filter((c) => c.dueDay === game.day);
  const deltas = lastResult
    ? { ...lastResult.deltas, science: lastResult.scienceGained }
    : undefined;

  return (
    <section className="mission stack">
      <div className="mission-head">
        <ScreenHeading>
          Day {game.day} of {MISSION_DAYS}
        </ScreenHeading>
        <p className="mission-crew">Crew: {crewName}</p>
      </div>

      <div className="mission-grid">
        <div className="mission-col stack">
          <EventCard event={event} day={game.day} />
          <p className="mission-words">
            Words to know: <GlossaryTerm k="solarFlare" />, <GlossaryTerm k="cme" />, <GlossaryTerm k="dose" />,{' '}
            <GlossaryTerm k="shielding" />.
          </p>
          <Meters meters={game.meters} scienceScore={game.scienceScore} deltas={deltas} />
          {dueToday.length > 0 && (
            <div className="card mission-carry" role="note" aria-labelledby="carry-title">
              <h2 id="carry-title" className="mission-carry-title">
                From yesterday
              </h2>
              <ul>
                {dueToday.map((c) => (
                  <li key={c.id}>
                    {METER_LABEL[c.meter]} {c.delta < 0 ? `▼ ${c.delta}` : `▲ +${c.delta}`}: {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mission-col">
          <PowerAllocator
            value={allocation}
            onChange={onAllocationChange}
            preview={preview}
            onConfirm={onConfirm}
            day={game.day}
          />
        </div>
      </div>
    </section>
  );
}

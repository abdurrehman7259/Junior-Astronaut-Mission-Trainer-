import type { Allocation, GameState, MarsSiteInfo, SiteId, TurnResult } from '../../shared/types';
import { MISSION_DAYS } from '../../shared/types';
import { siteOf } from '../../shared/eventSet';
import { dayWordCap } from '../../app/state';
import { isStubEvent } from '../../app/stub-events';
import { EarthMessage } from '../components/EarthMessage';
import { EventCard } from '../components/EventCard';
import { kidTextFor } from '../content/eventCopy';
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
  /** Default: the site of the game (the Moon for old states). On Mars, today's event stays hidden. */
  site?: SiteId;
  /** Real Mars facts for the Earth message (light time and its source). */
  marsSite?: MarsSiteInfo | null;
}

const METER_LABEL = { power: 'Power reserve', lifeSupport: 'Life support', crewHealth: 'Crew health' } as const;

export function MissionScreen({
  game,
  crewName,
  allocation,
  preview,
  lastResult,
  onAllocationChange,
  onConfirm,
  site: siteProp,
  marsSite = null,
}: Props) {
  const site = siteProp ?? siteOf(game);
  const isMars = site === 'mars';
  const event = game.events[game.day - 1]!;
  const yesterday = isMars && game.day > 1 ? (game.events[game.day - 2] ?? null) : null;
  const dueToday = game.carryOver.filter((c) => c.dueDay === game.day);
  const deltas = lastResult
    ? { ...lastResult.deltas, science: lastResult.scienceGained }
    : undefined;

  return (
    <section className="mission stack">
      <div className="mission-head">
        <ScreenHeading>
          {dayWordCap(site)} {game.day} of {MISSION_DAYS}
        </ScreenHeading>
        <p className="mission-crew">Crew: {crewName} · {isMars ? 'Mars base, Jezero Crater' : 'Moon base, south pole'}</p>
      </div>

      <div className="mission-grid">
        <div className="mission-col stack">
          {isMars ? (
            <EarthMessage marsSite={marsSite} yesterday={yesterday} />
          ) : (
            <EventCard event={event} day={game.day} kidText={isStubEvent(event) ? undefined : kidTextFor(event)} />
          )}
          <p className="mission-words">
            {isMars ? (
              <>
                Words to know: <GlossaryTerm k="sol" />, <GlossaryTerm k="commDelay" />,{' '}
                <GlossaryTerm k="jezero" />, <GlossaryTerm k="cme" />, <GlossaryTerm k="dose" />.
              </>
            ) : (
              <>
                Words to know: <GlossaryTerm k="solarFlare" />, <GlossaryTerm k="cme" />, <GlossaryTerm k="dose" />,{' '}
                <GlossaryTerm k="shielding" />.
              </>
            )}
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
            site={site}
          />
        </div>
      </div>
    </section>
  );
}

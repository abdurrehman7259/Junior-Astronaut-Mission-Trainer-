import type { Allocation, GameState, MarsSiteInfo, SiteId, TurnResult } from '../../shared/types';
import { MISSION_DAYS } from '../../shared/types';
import { siteOf } from '../../shared/eventSet';
import { dayWordCap } from '../../app/state';
import { isStubEvent } from '../../app/stub-events';
import { EarthMessage } from '../components/EarthMessage';
import { EventCard } from '../components/EventCard';
import { kidTextFor } from '../content/eventCopy';
import { DAY, NAMES } from '../content/copy';
import { WarningIcon } from '../components/icons';
import { Meters } from '../components/Meters';
import { PowerAllocator } from '../components/PowerAllocator';
import { ScreenHeading } from '../components/ScreenHeading';
import './MissionScreen.css';

interface Props {
  game: GameState;
  crewName: string;
  /** A draft: may sum to less than 10. */
  allocation: Allocation;
  /** null until all 10 power are shared. */
  preview: TurnResult | null;
  /** Yesterday's result. Kept for the app; the report shows its changes, not this screen. */
  lastResult?: TurnResult | null;
  onAllocationChange: (a: Allocation) => void;
  onConfirm: () => void;
  /** Default: the site of the game (the Moon for old states). On Mars, today's event stays hidden. */
  site?: SiteId;
  /** Real Mars facts for the Earth message (light time and its source). */
  marsSite?: MarsSiteInfo | null;
}

const METER_LABEL = { power: NAMES.battery, lifeSupport: NAMES.air, crewHealth: NAMES.crew } as const;

export function MissionScreen({
  game,
  crewName,
  allocation,
  preview,
  onAllocationChange,
  onConfirm,
  site: siteProp,
  marsSite = null,
}: Props) {
  const site = siteProp ?? siteOf(game);
  const isMars = site === 'mars';
  const dayWord = isMars ? 'sol' : 'day';
  const event = game.events[game.day - 1]!;
  const yesterday = isMars && game.day > 1 ? (game.events[game.day - 2] ?? null) : null;
  const dueToday = game.carryOver.filter((c) => c.dueDay === game.day);
  const meterPreview = preview ? { ...preview.deltas, science: preview.scienceGained } : null;

  return (
    <section className="mission stack">
      <div className="mission-head">
        <ScreenHeading>
          {dayWordCap(site)} {game.day} of {MISSION_DAYS}
        </ScreenHeading>
        <p className="mission-crew">{DAY.crewLine(crewName, site)}</p>
      </div>

      <div className="mission-grid">
        <div className="mission-col mission-col-left">
          <h2 className="mission-step">{isMars ? DAY.step1Mars : DAY.step1}</h2>
          {isMars ? (
            <EarthMessage marsSite={marsSite} yesterday={yesterday} />
          ) : (
            <EventCard event={event} day={game.day} kidText={isStubEvent(event) ? undefined : kidTextFor(event)} />
          )}
          <Meters
            meters={game.meters}
            scienceScore={game.scienceScore}
            preview={meterPreview}
            previewLabel={isMars ? DAY.previewLabelMars : DAY.previewLabel(dayWord)}
            showRules
          />
          {isMars && preview && (
            <p className="mission-warn">
              <WarningIcon size={20} />
              <span>{DAY.previewMarsWarn}</span>
            </p>
          )}
          {dueToday.length > 0 && (
            <div className="card mission-carry" role="note" aria-labelledby="carry-title">
              <h2 id="carry-title" className="mission-carry-title">
                {DAY.fromYesterday(dayWord)}
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
        <div className="mission-col mission-col-right">
          <PowerAllocator
            value={allocation}
            onChange={onAllocationChange}
            onConfirm={onConfirm}
            day={game.day}
            site={site}
          />
        </div>
      </div>
    </section>
  );
}

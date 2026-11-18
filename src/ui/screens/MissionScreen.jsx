import { MISSION_DAYS } from '../../shared/types.js';
import { siteOf } from '../../shared/eventSet.js';
import { dayWordCap } from '../../app/state.js';
import { isStubEvent } from '../../app/stub-events.js';
import { EarthMessage } from '../components/EarthMessage.jsx';
import { EventCard } from '../components/EventCard.jsx';
import { kidTextFor } from '../content/eventCopy.js';
import { DAY, NAMES } from '../content/copy.js';
import { WarningIcon } from '../components/icons.jsx';
import { Meters } from '../components/Meters.jsx';
import { PowerAllocator } from '../components/PowerAllocator.jsx';
import { ScreenHeading } from '../components/ScreenHeading.jsx';

const METER_LABEL = { power: NAMES.battery, lifeSupport: NAMES.air, crewHealth: NAMES.crew };

export function MissionScreen({
  game,
  crewName,
  allocation,
  preview,
  onAllocationChange,
  onConfirm,
  site: siteProp,
  marsSite = null,
}) {
  const site = siteProp ?? siteOf(game);
  const isMars = site === 'mars';
  const dayWord = isMars ? 'sol' : 'day';
  const event = game.events[game.day - 1];
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
          <div className="mission-after">
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
        </div>
        <div className="mission-col mission-col-right">
          <PowerAllocator
            value={allocation}
            onChange={onAllocationChange}
            onConfirm={onConfirm}
            day={game.day}
            site={site}
            batteryWillEmpty={preview ? preview.after.power === 0 : false}
          />
        </div>
      </div>
    </section>
  );
}

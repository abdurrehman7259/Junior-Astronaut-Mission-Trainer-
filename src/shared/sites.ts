/**
 * Per-site definitions shared by the engine and the UI (D-023).
 * Engine balance numbers per site live in src/engine/rules.ts (B9), keyed by SiteId. Only the
 * cross-cutting mechanic flag and the display and data wiring live here.
 */
import type { SiteId, SolarEvent } from './types';

export interface SiteDefinition {
  id: SiteId;
  /** Player-facing names. */
  name: string;
  place: string;
  /** "day" on the Moon, "sol" on Mars. */
  dayWord: 'day' | 'sol';
  /** Snapshot of solar events for this site, under /public. */
  eventsFile: string;
  /**
   * GAME RULE (not a measurement): how many mission days late Mission Control's storm warning arrives.
   * 0 = the player sees today's event before allocating (Moon). 1 = today's event stays hidden until the
   * report (Mars). This is a simplification inspired by the real 4–24 minute Earth–Mars light delay.
   */
  warningDelayDays: 0 | 1;
}

export const SITES: Record<SiteId, SiteDefinition> = {
  moon: {
    id: 'moon',
    name: 'Moon',
    place: 'Moon base near the lunar south pole',
    dayWord: 'day',
    eventsFile: '/data/donki-events.json',
    warningDelayDays: 0,
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    place: 'Mars base in Jezero Crater',
    dayWord: 'sol',
    eventsFile: '/data/donki-mars-events.json',
    warningDelayDays: 1,
  },
};

export const SITE_IDS: readonly SiteId[] = ['moon', 'mars'];

/**
 * Stand-in for today's event in a preview when the warning hasn't arrived (warningDelayDays > 0).
 * It is NOT a real record and must never be displayed as an event. Detect it with isForecastPlaceholder().
 */
export const UNKNOWN_FORECAST_EVENT: SolarEvent = {
  id: 'FORECAST-UNKNOWN',
  source: 'DONKI',
  kind: 'QUIET',
  realDate: '2000-01-01',
  severity: 0,
  kidText: 'No warning from Earth yet.',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
};

export const isForecastPlaceholder = (e: Pick<SolarEvent, 'id'>) => e.id === UNKNOWN_FORECAST_EVENT.id;

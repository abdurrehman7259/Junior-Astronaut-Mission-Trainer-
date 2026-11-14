/**
 * The game-engine API.
 *
 * builder agent (task B2) implements it in src/engine/ and exports these four functions
 * by name from src/engine/index.ts, so that
 *   `import * as engine from '../engine'`  satisfies  `GameEngine`.
 * Until B2 is accepted the UI runs on src/app/stub-engine.ts (same API, fake numbers).
 *
 * Engine rules (binding for both the real engine and the stub):
 * - Pure and deterministic: no Math.random, Date.now, DOM, network, file or console I/O.
 *   All randomness comes from a seeded PRNG driven by `seed`.
 * - Never mutate inputs. Return new objects.
 * - All tunable numbers live in one exported rules object (src/engine/rules.ts), labelled as game rules.
 * - On sites with SITES[site].warningDelayDays === 0 (Moon): previewTurn(s, a) must deep-equal applyTurn(s, a).result.
 * - Order of a day on the Moon: the day's event card is shown first (the player sees kind and severity),
 *   then the player allocates power, then the turn resolves.
 * - Sites (D-023, src/shared/sites.ts): one engine, per-site rules in src/engine/rules.ts keyed by SiteId; no forked code.
 *   On sites with warningDelayDays > 0 (Mars), today's event is unknown when the player allocates:
 *   previewTurn resolves the day as if today's event were UNKNOWN_FORECAST_EVENT (a calm Sun) and returns that
 *   placeholder as result.event, so a preview never leaks today's real event. applyTurn always uses the real event.
 */
import type { Allocation, GameState, SiteId, SolarEvent, TurnResult } from './types';

export interface GameEngine {
  /**
   * Start a new mission on day 1 with full starting meters.
   * `eventSet` is the output of drawEventSet (length MISSION_DAYS); it is copied into state.events
   * and state.eventSetId = eventSetIdOf(eventSet). `site` defaults to 'moon' and is stored in state.site
   * (the real engine always sets it from B9 on).
   * Throws RangeError if eventSet.length !== MISSION_DAYS.
   */
  createGame(seed: number, eventSet: SolarEvent[], site?: SiteId): GameState;

  /**
   * What would happen if `alloc` were played today. No mutation. Used for the live preview.
   * Throws RangeError if the allocation is invalid (see isValidAllocation) or state.status !== 'playing'.
   */
  previewTurn(state: GameState, alloc: Allocation): TurnResult;

  /**
   * Play today with `alloc`. Returns the next state (day + 1, or status 'won' | 'ended') and the result.
   * Same throws as previewTurn.
   */
  applyTurn(state: GameState, alloc: Allocation): { state: GameState; result: TurnResult };

  /**
   * Pick MISSION_DAYS events from the snapshot pool, deterministically from `seed`.
   * - Between 3 and 5 (inclusive) are real FLR or CME events (US-04); the rest are real QUIET days.
   * - At least one has severity >= 2.
   * - No event id appears twice.
   * - eventSetIdOf(result) is not in excludeSetIds (retry with a derived seed; FR-10).
   * - If the pool cannot satisfy the rules, throw an Error with a clear message.
   */
  drawEventSet(events: SolarEvent[], seed: number, excludeSetIds: string[]): SolarEvent[];
}

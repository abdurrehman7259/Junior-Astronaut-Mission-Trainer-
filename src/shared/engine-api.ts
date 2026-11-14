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
 * - previewTurn(s, a) must deep-equal applyTurn(s, a).result.
 * - Order of a day: the day's event card is shown first (the player sees kind and severity),
 *   then the player allocates power, then the turn resolves.
 */
import type { Allocation, GameState, SolarEvent, TurnResult } from './types';

export interface GameEngine {
  /**
   * Start a new mission on day 1 with full starting meters.
   * `eventSet` is the output of drawEventSet (length MISSION_DAYS); it is copied into state.events
   * and state.eventSetId = eventSetIdOf(eventSet).
   * Throws RangeError if eventSet.length !== MISSION_DAYS.
   */
  createGame(seed: number, eventSet: SolarEvent[]): GameState;

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

/** Mirrors tests/ui/engine-contract.test.js against the real engine and test-only pool. */
import { describe, expect, it } from 'vitest';
import * as engine from '../../src/engine/index.js';

import { eventSetIdOf } from '../../src/shared/eventSet.js';
import { GameStateSchema, TurnResultSchema } from '../../src/shared/schemas.js';
import { MISSION_DAYS } from '../../src/shared/types.js';
import { EVENTS } from './fixtures/events.js';
import { balanced, deepFreeze } from './helpers.js';

const api = engine;
const newGame = (seed = 42) => api.createGame(seed, api.drawEventSet(EVENTS, seed, []));

describe('engine contract', () => {
  it('drawEventSet gives 10 unique events with 3-5 real ones', () => {
    const set = api.drawEventSet(EVENTS, 7, []);
    expect(set).toHaveLength(MISSION_DAYS);
    expect(new Set(set.map((event) => event.id)).size).toBe(MISSION_DAYS);
    const real = set.filter((event) => event.kind !== 'QUIET').length;
    expect(real).toBeGreaterThanOrEqual(3);
    expect(real).toBeLessThanOrEqual(5);
    expect(set.some((event) => event.severity >= 2)).toBe(true);
  });

  it('drawEventSet is deterministic and respects excludeSetIds', () => {
    const a = api.drawEventSet(EVENTS, 7, []);
    expect(api.drawEventSet(EVENTS, 7, [])).toEqual(a);
    const b = api.drawEventSet(EVENTS, 7, [eventSetIdOf(a)]);
    expect(eventSetIdOf(b)).not.toBe(eventSetIdOf(a));
  });

  it('createGame returns a valid day-1 state', () => {
    const state = newGame();
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(state.day).toBe(1);
    expect(state.status).toBe('playing');
  });

  it('previewTurn equals applyTurn and does not mutate', () => {
    const state = deepFreeze(newGame());
    const frozen = structuredClone(state);
    const preview = api.previewTurn(state, deepFreeze({ ...balanced }));
    const { result } = api.applyTurn(state, balanced);
    expect(preview).toEqual(result);
    expect(state).toEqual(frozen);
    TurnResultSchema.parse(result);
  });

  it('rejects invalid allocations', () => {
    const state = newGame();
    expect(() => api.previewTurn(state, { life: 5, shield: 5, science: 5 })).toThrow(RangeError);
    expect(() => api.applyTurn(state, { life: 2.5, shield: 2.5, science: 5 })).toThrow(RangeError);
  });

  it('a full mission ends in won or ended, with valid states throughout', () => {
    let state = newGame(3);
    for (let i = 0; i < MISSION_DAYS && state.status === 'playing'; i++) {
      state = api.applyTurn(state, balanced).state;
      GameStateSchema.parse(state);
    }
    expect(['won', 'ended']).toContain(state.status);
    expect(() => api.applyTurn(state, balanced)).toThrow(RangeError);
  });
});

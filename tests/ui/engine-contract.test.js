/**
 * Contract conformance for whichever engine src/app/engine.js exports (stub now, B2 later).
 * The real engine must pass this unchanged.
 */
import { describe, expect, it } from 'vitest';
import { engine } from '../../src/app/engine.js';
import { STUB_EVENTS } from '../../src/app/stub-events.js';
import { eventSetIdOf } from '../../src/shared/eventSet.js';
import { GameStateSchema, TurnResultSchema } from '../../src/shared/schemas.js';
import { MISSION_DAYS } from '../../src/shared/types.js';

const balanced = { life: 4, shield: 3, science: 3 };

function newGame(seed = 42) {
  return engine.createGame(seed, engine.drawEventSet(STUB_EVENTS, seed, []));
}

describe('engine contract', () => {
  it('drawEventSet gives 10 unique events with 3-5 real ones', () => {
    const set = engine.drawEventSet(STUB_EVENTS, 7, []);
    expect(set).toHaveLength(MISSION_DAYS);
    expect(new Set(set.map((e) => e.id)).size).toBe(MISSION_DAYS);
    const real = set.filter((e) => e.kind !== 'QUIET').length;
    expect(real).toBeGreaterThanOrEqual(3);
    expect(real).toBeLessThanOrEqual(5);
    expect(set.some((e) => e.severity >= 2)).toBe(true);
  });

  it('drawEventSet is deterministic and respects excludeSetIds', () => {
    const a = engine.drawEventSet(STUB_EVENTS, 7, []);
    expect(engine.drawEventSet(STUB_EVENTS, 7, [])).toEqual(a);
    const b = engine.drawEventSet(STUB_EVENTS, 7, [eventSetIdOf(a)]);
    expect(eventSetIdOf(b)).not.toBe(eventSetIdOf(a));
  });

  it('createGame returns a valid day-1 state', () => {
    const s = newGame();
    expect(GameStateSchema.parse(s)).toEqual(s);
    expect(s.day).toBe(1);
    expect(s.status).toBe('playing');
  });

  it('previewTurn equals applyTurn and does not mutate', () => {
    const s = newGame();
    const frozen = structuredClone(s);
    const preview = engine.previewTurn(s, balanced);
    const { result } = engine.applyTurn(s, balanced);
    expect(preview).toEqual(result);
    expect(s).toEqual(frozen);
    TurnResultSchema.parse(result);
  });

  it('rejects invalid allocations', () => {
    const s = newGame();
    expect(() => engine.previewTurn(s, { life: 5, shield: 5, science: 5 })).toThrow(RangeError);
    expect(() => engine.applyTurn(s, { life: 2.5, shield: 2.5, science: 5 })).toThrow(RangeError);
  });

  it('a full mission ends in won or ended, with valid states throughout', () => {
    let s = newGame(3);
    for (let i = 0; i < MISSION_DAYS && s.status === 'playing'; i++) {
      s = engine.applyTurn(s, balanced).state;
      GameStateSchema.parse(s);
    }
    expect(['won', 'ended']).toContain(s.status);
    expect(() => engine.applyTurn(s, balanced)).toThrow(RangeError);
  });
});

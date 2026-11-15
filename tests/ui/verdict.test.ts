import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/engine/rules';
import {
  AIR_MIN_UNITS,
  HURT_THRESHOLD,
  lessonFor,
  lossReason,
  meterLinesFor,
  verdictFor,
} from '../../src/app/verdict';
import type { TurnResult } from '../../src/shared/types';

function r(over: Partial<TurnResult> = {}): TurnResult {
  return {
    day: 2,
    allocation: { life: 4, shield: 3, science: 3 },
    event: {
      id: 'e',
      source: 'DONKI',
      kind: 'FLR',
      realDate: '2024-05-10',
      severity: 2,
      kidText: 'x',
      sourceUrl: 'https://example.invalid/',
    },
    before: { power: 80, lifeSupport: 70, crewHealth: 90 },
    after: { power: 72, lifeSupport: 70, crewHealth: 90 },
    deltas: { power: -8, lifeSupport: 0, crewHealth: 0 },
    scienceBefore: 0,
    scienceGained: 3,
    scienceAfter: 3,
    dose: { incoming: 20, blocked: 20, received: 0 },
    explanations: { power: '', lifeSupport: '', crewHealth: '', science: '' },
    statusAfter: 'playing',
    ...over,
  };
}
const calm = { incoming: 0, blocked: 0, received: 0 };

describe('AIR_MIN_UNITS', () => {
  it('matches the engine rule', () => {
    expect(AIR_MIN_UNITS).toBe(RULES.lifeSupportMinUnits);
  });
});

describe('verdictFor', () => {
  it('loss: crew first, otherwise air', () => {
    expect(verdictFor(r({ statusAfter: 'ended', after: { power: 5, lifeSupport: 50, crewHealth: 0 } }))).toBe(
      'lostCrew',
    );
    expect(verdictFor(r({ statusAfter: 'ended', after: { power: 5, lifeSupport: 0, crewHealth: 50 } }))).toBe(
      'lostAir',
    );
  });
  it('hurt at the threshold, mostly blocked just under it', () => {
    expect(verdictFor(r({ dose: { incoming: 30, blocked: 30 - HURT_THRESHOLD, received: HURT_THRESHOLD } }))).toBe(
      'hurt',
    );
    expect(
      verdictFor(r({ dose: { incoming: 30, blocked: 31 - HURT_THRESHOLD, received: HURT_THRESHOLD - 1 } })),
    ).toBe('mostlyBlocked');
  });
  it('blocked when nothing got through', () => {
    expect(verdictFor(r())).toBe('blocked');
  });
  it('air low beats battery empty and calm verdicts', () => {
    expect(verdictFor(r({ dose: calm, allocation: { life: AIR_MIN_UNITS - 1, shield: 0, science: 7 } }))).toBe(
      'airLow',
    );
  });
  it('battery empty', () => {
    expect(verdictFor(r({ dose: calm, after: { power: 0, lifeSupport: 70, crewHealth: 90 } }))).toBe('batteryEmpty');
  });
  it('calm days', () => {
    expect(verdictFor(r({ dose: calm }))).toBe('shieldsWasted');
    expect(verdictFor(r({ dose: calm, allocation: { life: 4, shield: 0, science: 6 } }))).toBe('calmScience');
    expect(verdictFor(r({ dose: calm, allocation: { life: 10, shield: 0, science: 0 } }))).toBe('calmNoScience');
  });
});

describe('meterLinesFor', () => {
  it('returns battery, air, crew, science in order', () => {
    expect(meterLinesFor(r()).map((l) => l.meter)).toEqual(['battery', 'air', 'crew', 'science']);
  });
  it('battery kinds', () => {
    const kind = (before: number, after: number) =>
      meterLinesFor(
        r({ before: { power: before, lifeSupport: 70, crewHealth: 90 }, after: { power: after, lifeSupport: 70, crewHealth: 90 } }),
      )[0].kind;
    expect(kind(10, 0)).toBe('empty');
    expect(kind(50, 40)).toBe('down');
    expect(kind(50, 60)).toBe('up');
    expect(kind(50, 50)).toBe('same');
  });
  it('air short, and crew kinds', () => {
    const lines = meterLinesFor(
      r({ allocation: { life: 2, shield: 0, science: 8 }, dose: { incoming: 10, blocked: 4, received: 6 } }),
    );
    expect(lines[1]).toMatchObject({ meter: 'air', kind: 'short', units: 2 });
    expect(lines[2]).toMatchObject({ meter: 'crew', kind: 'hurt', blocked: 4, received: 6 });
    expect(meterLinesFor(r())[2]).toMatchObject({ kind: 'safe' });
    expect(meterLinesFor(r({ dose: calm }))[2]).toMatchObject({ kind: 'calm' });
  });
  it('science points or none', () => {
    expect(meterLinesFor(r())[3]).toMatchObject({ kind: 'points', points: 3 });
    expect(meterLinesFor(r({ scienceGained: 0 }))[3]).toMatchObject({ kind: 'none' });
  });
});

describe('lessonFor and lossReason', () => {
  it('storm lesson when hurt, Mars lesson on Mars', () => {
    const hurt = r({ dose: { incoming: 30, blocked: 0, received: 30 } });
    expect(lessonFor([hurt], 'moon')).toBe('storm');
    expect(lessonFor([hurt], 'mars')).toBe('mars');
  });
  it('calm lesson when most calm days had no science, else good', () => {
    expect(lessonFor([r({ dose: calm, allocation: { life: 10, shield: 0, science: 0 } })], 'moon')).toBe('calm');
    expect(lessonFor([r()], 'moon')).toBe('good');
  });
  it('loss reason', () => {
    expect(lossReason(r({ after: { power: 5, lifeSupport: 50, crewHealth: 0 } }))).toBe('crew');
    expect(lossReason(r({ after: { power: 5, lifeSupport: 0, crewHealth: 50 } }))).toBe('air');
    expect(lossReason(undefined)).toBe('air');
  });
});

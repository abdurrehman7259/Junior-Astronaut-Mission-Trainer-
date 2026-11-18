import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/engine/rules.js';
import {
  AIR_MIN_UNITS,
  BATTERY_LOW,
  HURT_THRESHOLD,
  lessonFor,
  lossReason,
  meterLinesFor,
  verdictFor,
} from '../../src/app/verdict.js';

function r(over = {}) {
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
  it('hurt only when shields blocked less than got through and at least 10 got through', () => {
    expect(
      verdictFor(r({ dose: { incoming: 30, blocked: 30 - 2 * HURT_THRESHOLD, received: 2 * HURT_THRESHOLD } })),
    ).toBe('hurt');
    expect(verdictFor(r({ dose: { incoming: 20, blocked: 5, received: HURT_THRESHOLD } }))).toBe('hurt');
    expect(verdictFor(r({ dose: { incoming: 30, blocked: 31 - HURT_THRESHOLD, received: HURT_THRESHOLD - 1 } }))).toBe(
      'mostlyBlocked',
    );
  });
  it('bigStorm only when 10 or more got through and shields blocked MORE than got through', () => {
    expect(verdictFor(r({ dose: { incoming: 40, blocked: 30, received: HURT_THRESHOLD } }))).toBe('bigStorm');
    expect(verdictFor(r({ dose: { incoming: 31, blocked: 16, received: 15 } }))).toBe('bigStorm');
  });
  it('hurt when blocked equals received (about half got through)', () => {
    expect(verdictFor(r({ dose: { incoming: 30, blocked: 15, received: 15 } }))).toBe('hurt');
    expect(verdictFor(r({ dose: { incoming: 40, blocked: 20, received: 20 } }))).toBe('hurt');
  });
  it('battery empty beats hurt', () => {
    expect(
      verdictFor(
        r({ dose: { incoming: 30, blocked: 0, received: 30 }, after: { power: 0, lifeSupport: 70, crewHealth: 60 } }),
      ),
    ).toBe('batteryEmpty');
  });
  it('batteryLow when the battery ends at 20 or less (and is not empty)', () => {
    expect(BATTERY_LOW).toBe(20);
    expect(verdictFor(r({ dose: calm, after: { power: BATTERY_LOW, lifeSupport: 70, crewHealth: 90 } }))).toBe(
      'batteryLow',
    );
    expect(verdictFor(r({ dose: calm, after: { power: BATTERY_LOW + 1, lifeSupport: 70, crewHealth: 90 } }))).toBe(
      'shieldsWasted',
    );
    expect(verdictFor(r({ after: { power: 10, lifeSupport: 70, crewHealth: 90 } }))).toBe('batteryLow');
  });
  it('blocked when nothing got through', () => {
    expect(verdictFor(r())).toBe('blocked');
  });
  it('air low beats battery empty and calm verdicts', () => {
    expect(verdictFor(r({ dose: calm, allocation: { life: AIR_MIN_UNITS - 1, shield: 0, science: 7 } }))).toBe(
      'airLow',
    );
  });
  it('battery empty on a calm day is batteryEmptyCalm (shields did not matter)', () => {
    expect(verdictFor(r({ dose: calm, after: { power: 0, lifeSupport: 70, crewHealth: 90 } }))).toBe(
      'batteryEmptyCalm',
    );
  });
  it('battery empty on a storm day with 0 shields and a tiny storm is batteryEmptyCalm', () => {
    expect(
      verdictFor(
        r({
          allocation: { life: 4, shield: 0, science: 6 },
          dose: { incoming: 5, blocked: 0, received: 5 },
          after: { power: 0, lifeSupport: 70, crewHealth: 90 },
        }),
      ),
    ).toBe('batteryEmptyCalm');
  });
  it('battery empty on a storm day with shields up is batteryEmpty', () => {
    expect(
      verdictFor(
        r({ dose: { incoming: 30, blocked: 6, received: 24 }, after: { power: 0, lifeSupport: 70, crewHealth: 60 } }),
      ),
    ).toBe('batteryEmpty');
  });
  it('noShields: a storm got through and shields had 0 power; it beats an empty battery', () => {
    const noShield = { life: 4, shield: 0, science: 6 };
    expect(verdictFor(r({ allocation: noShield, dose: { incoming: 45, blocked: 0, received: 45 } }))).toBe('noShields');
    expect(
      verdictFor(
        r({
          allocation: noShield,
          dose: { incoming: 45, blocked: 0, received: 45 },
          after: { power: 0, lifeSupport: 70, crewHealth: 45 },
        }),
      ),
    ).toBe('noShields');
    // A tiny storm (under 10 got through) is not worth the noShields scolding.
    expect(verdictFor(r({ allocation: noShield, dose: { incoming: 5, blocked: 0, received: 5 } }))).not.toBe(
      'noShields',
    );
  });
  it('airNone: 0 power for Air & food beats airLow and bigStorm, but not hurt', () => {
    const noAir = { life: 0, shield: 5, science: 5 };
    expect(verdictFor(r({ dose: calm, allocation: noAir }))).toBe('airNone');
    expect(verdictFor(r({ allocation: noAir, dose: { incoming: 40, blocked: 30, received: 10 } }))).toBe('airNone');
    expect(verdictFor(r({ allocation: noAir, dose: { incoming: 40, blocked: 10, received: 30 } }))).toBe('hurt');
    expect(verdictFor(r({ dose: calm, allocation: { life: 2, shield: 4, science: 4 } }))).toBe('airLow');
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
    const kind = (before, after) =>
      meterLinesFor(
        r({
          before: { power: before, lifeSupport: 70, crewHealth: 90 },
          after: { power: after, lifeSupport: 70, crewHealth: 90 },
        }),
      )[0].kind;
    expect(kind(10, 0)).toBe('empty');
    expect(kind(50, 40)).toBe('down');
    expect(kind(50, 60)).toBe('up');
    expect(kind(50, 50)).toBe('same');
  });
  it('air shortDown when air units are short and air already fell', () => {
    const line = meterLinesFor(
      r({
        allocation: { life: 0, shield: 5, science: 5 },
        before: { power: 80, lifeSupport: 80, crewHealth: 90 },
        after: { power: 72, lifeSupport: 40, crewHealth: 90 },
      }),
    )[1];
    expect(line).toMatchObject({ meter: 'air', kind: 'shortDown', units: 0 });
    expect(meterLinesFor(r({ allocation: { life: 3, shield: 3, science: 4 } }))[1]).toMatchObject({ kind: 'short' });
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
  it('battery lesson when the battery ran out and shields were not the cause', () => {
    const empty = r({ dose: calm, after: { power: 0, lifeSupport: 70, crewHealth: 90 } });
    expect(lessonFor([empty], 'moon')).toBe('battery');
    expect(lessonFor([empty], 'mars')).toBe('battery');
  });
  it('loss reason', () => {
    expect(lossReason(r({ after: { power: 5, lifeSupport: 50, crewHealth: 0 } }))).toBe('crew');
    expect(lossReason(r({ after: { power: 5, lifeSupport: 0, crewHealth: 50 } }))).toBe('air');
    expect(lossReason(undefined)).toBe('air');
  });
});

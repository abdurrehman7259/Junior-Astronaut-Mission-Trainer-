import { describe, expect, it } from 'vitest';
import { applyTurn, createGame, drawEventSet, previewTurn, RULES, RULES_BY_SITE, withRules } from '../../src/engine';
import { siteOf } from '../../src/shared/eventSet';
import { GameStateSchema, TurnResultSchema } from '../../src/shared/schemas';
import { SITE_IDS, UNKNOWN_FORECAST_EVENT } from '../../src/shared/sites';
import { MISSION_DAYS, type SiteId } from '../../src/shared/types';
import { knownSeverity, strategies } from '../../scripts/lib/strategies';
import { selectedSites } from '../../scripts/simulate';
import { EVENTS } from './fixtures/events';
import { allocations, balanced, daysOf, deepFreeze } from './helpers';

describe('one engine, per-site rules', () => {
  it('always sets the requested site, defaulting to Moon', () => {
    expect(createGame(1, daysOf('QUIET')).site).toBe('moon');
    for (const site of SITE_IDS) {
      const state = createGame(1, daysOf('QUIET'), site);
      expect(state.site).toBe(site);
      expect(state.meters).toEqual({ power: RULES_BY_SITE[site].start.power,
        lifeSupport: RULES_BY_SITE[site].start.lifeSupport, crewHealth: RULES_BY_SITE[site].start.crewHealth });
      GameStateSchema.parse(state);
      expect(applyTurn(state, balanced).state.site).toBe(site);
    }
  });

  it('treats old states without site exactly as Moon states', () => {
    const explicit = createGame(9, daysOf('FLR', 3), 'moon');
    const legacy = structuredClone(explicit);
    delete legacy.site;
    expect(siteOf(legacy)).toBe('moon');
    expect(previewTurn(legacy, balanced)).toEqual(previewTurn(explicit, balanced));
    expect(applyTurn(legacy, balanced).result).toEqual(applyTurn(explicit, balanced).result);
    expect(applyTurn(legacy, balanced).state).toEqual(applyTurn(explicit, balanced).state);
    GameStateSchema.parse(applyTurn(legacy, balanced).state);
  });

  it('rejects unknown sites with a clear RangeError', () => {
    for (const site of ['venus', 'toString', '__proto__']) {
      expect(() => createGame(1, daysOf('QUIET'), site as SiteId))
        .toThrow(new RangeError(`Unknown site "${site}"; choose moon or mars.`));
    }
  });

  it('keeps Moon previews exact while Mars assumes calm for every allocation and event kind', () => {
    for (const site of SITE_IDS) {
      for (const severity of [0, 1, 2, 3] as const) {
        for (const kind of severity === 0 ? ['QUIET'] as const : ['FLR', 'CME'] as const) {
          for (const power of [0, 65]) {
            const state = createGame(7, daysOf(kind, severity), site);
            state.meters.power = power;
            state.day = MISSION_DAYS;
            state.carryOver = [{ id: 'air', dueDay: state.day, meter: 'lifeSupport', delta: -10,
              reason: 'Earlier shortage.' }];
            const calm = { ...state, events: daysOf('QUIET') };
            deepFreeze(state);
            for (const allocation of allocations) {
              const preview = previewTurn(state, allocation);
              const applied = applyTurn(state, allocation);
              TurnResultSchema.parse(preview);
              GameStateSchema.parse(applied.state);
              expect(applied.result.event).toEqual(state.events[state.day - 1]);
              if (site === 'moon') expect(preview).toEqual(applied.result);
              else {
                // Deep equality covers metadata, power, science, explanations and status too.
                expect(preview).toEqual(previewTurn(calm, allocation));
                expect(preview.event).toEqual(UNKNOWN_FORECAST_EVENT);
                expect(preview.explanations.crewHealth)
                  .toBe('If the Sun stays calm, no game dose reaches the crew.');
                expect(applied.result.explanations.crewHealth).not.toContain('If the Sun');
                expect(preview.dose).toEqual({ incoming: 0, blocked: 0, received: 0 });
                expect(preview.after.crewHealth).toBe(state.meters.crewHealth);
                if (severity > 0) {
                  expect(applied.result.dose.incoming).toBe(RULES_BY_SITE.mars.dosePerSeverity[severity]);
                  expect(applied.result.after.crewHealth).toBeLessThan(preview.after.crewHealth);
                }
              }
            }
          }
        }
      }
    }
  });

  it('detaches the placeholder and keeps ordinary validation on delayed previews', () => {
    const state = deepFreeze(createGame(1, daysOf('CME', 3), 'mars'));
    const before = JSON.stringify(state);
    const preview = previewTurn(state, balanced);
    preview.event.id = 'changed';
    expect(previewTurn(state, balanced).event).toEqual(UNKNOWN_FORECAST_EVENT);
    expect(JSON.stringify(state)).toBe(before);
    expect(() => previewTurn(state, { life: 0, shield: 0, science: 0 })).toThrow(RangeError);
    expect(() => previewTurn({ ...state, status: 'won' }, balanced)).toThrow(RangeError);
  });

  it('supports independent cloned overrides per site and legacy single-rule overrides', () => {
    const overrides = {
      moon: { ...RULES, sciencePerUnit: 7 },
      mars: { ...RULES_BY_SITE.mars, sciencePerUnit: 9, start: { ...RULES.start, power: 50 } },
    };
    const engine = withRules(overrides);
    overrides.mars.sciencePerUnit = 100;
    overrides.mars.start.power = 0;
    for (const site of SITE_IDS) {
      const state = engine.createGame(1, daysOf('QUIET'), site);
      expect(engine.applyTurn(state, balanced).result.scienceGained).toBe(site === 'moon' ? 21 : 27);
      expect(state.meters.power).toBe(site === 'moon' ? 65 : 50);
      expect(applyTurn(createGame(1, daysOf('QUIET'), site), balanced).result.scienceGained).toBe(15);
      const single = withRules({ ...RULES, sciencePerUnit: 8 });
      expect(single.applyTurn(single.createGame(1, daysOf('QUIET'), site), balanced).result.scienceGained).toBe(24);
    }
  });

  it('uses gentler recharge, slightly stronger shields and the same game doses on Mars', () => {
    expect(RULES_BY_SITE.moon).toBe(RULES);
    expect(RULES_BY_SITE.mars.powerRechargePerDay).toBeLessThan(RULES.powerRechargePerDay);
    expect(RULES_BY_SITE.mars.dosePerSeverity).toEqual(RULES.dosePerSeverity);
    expect(RULES_BY_SITE.mars.shieldHalfProtectionUnits).toBe(2.75);
    for (const site of SITE_IDS) {
      const state = createGame(1, daysOf('QUIET'), site);
      expect(applyTurn(state, { life: 10, shield: 0, science: 0 }).result.deltas.power)
        .toBe(RULES_BY_SITE[site].powerRechargePerDay);
    }
    const marsPool = EVENTS.map(event => ({ ...event, marsImpact: 'game-only' as const }));
    const drawn = drawEventSet(marsPool, 1, []);
    expect(drawn.filter(event => event.kind !== 'QUIET').length).toBeGreaterThanOrEqual(3);
    expect(drawn.filter(event => event.kind !== 'QUIET').length).toBeLessThanOrEqual(5);
  });
});

describe('simulator site support', () => {
  it('selects both sites by default and rejects invalid CLI options', () => {
    expect(selectedSites([])).toEqual(SITE_IDS);
    expect(selectedSites(['--site', 'both'])).toEqual(SITE_IDS);
    for (const site of SITE_IDS) expect(selectedSites(['--site', site])).toEqual([site]);
    for (const args of [['--site'], ['--site', 'venus'], ['mars'], ['--site', 'mars', 'extra']]) {
      expect(() => selectedSites(args)).toThrow(RangeError);
    }
  });

  it('makes every Mars policy blind to today and all future events', () => {
    let state = createGame(1, daysOf('CME', 3), 'mars');
    expect(knownSeverity(state)).toBe(0);
    for (const day of [1, 2]) {
      expect(state.day).toBe(day);
      const hidden = { ...state, get events(): typeof state.events { throw new Error('Unseen event read'); } };
      for (const policy of Object.values(strategies('mars'))) expect(policy(hidden)).toEqual(policy(state));
      state = applyTurn(state, balanced).state;
      expect(knownSeverity(state)).toBe(3);
    }
    const calmReport = { ...state, history: state.history.map(turn => ({ ...turn,
      event: { ...turn.event, severity: 0 as const } })) };
    expect(strategies('mars').adaptive(calmReport)).not.toEqual(strategies('mars').adaptive(state));
    const lowAir = { ...calmReport, meters: { ...calmReport.meters, lifeSupport: 20 } };
    expect(strategies('mars')['adaptive-plus'](lowAir).life)
      .toBeGreaterThan(strategies('mars')['adaptive-plus'](calmReport).life);
    expect(knownSeverity(createGame(1, daysOf('CME', 3), 'moon'))).toBe(3);
  });

  it('keeps Mars kid policies simple, meter-aware and distinct from adaptive policies', () => {
    const policies = strategies('mars');
    const kid = policies['kid meter-aware'];
    const state = createGame(1, daysOf('CME', 3), 'mars');
    for (const [lifeSupport, crewHealth, expected] of [
      [50, 50, { life: 5, shield: 3, science: 2 }],
      [49, 50, { life: 6, shield: 3, science: 1 }],
      [50, 49, { life: 5, shield: 5, science: 0 }],
      [49, 49, { life: 6, shield: 4, science: 0 }],
    ] as const) {
      const input = { ...state, meters: { ...state.meters, lifeSupport, crewHealth } };
      expect(kid(input)).toEqual(expected);
      expect(policies['kid steady (5/3/2)'](input)).toEqual({ life: 5, shield: 3, science: 2 });
      expect(policies['balanced (4/3/3)'](input)).toEqual(balanced);
    }
    const low = { ...state, meters: { ...state.meters, crewHealth: 49 } };
    expect(kid(low)).not.toEqual(policies.adaptive(low));
    expect(kid(low)).not.toEqual(policies['adaptive-plus'](low));
  });
});

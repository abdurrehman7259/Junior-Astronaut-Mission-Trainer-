import { describe, expect, it } from 'vitest';
import type { SolarEvent, SiteId } from '../../src/shared/types';
import { explainTurn } from '../../src/engine/explain';

describe('CME power explanations', () => {
  it('labels every CME-day power explanation as a game rule', () => {
    const event: SolarEvent = {
      id: 'cme-test', source: 'DONKI', kind: 'CME', realDate: '2024-01-01', severity: 1,
      kidText: 'A recorded CME.', sourceUrl: 'https://example.com',
    };
    for (const site of ['moon', 'mars'] satisfies SiteId[]) {
      for (const allocation of [
        { life: 10, shield: 0, science: 0 },
        { life: 8, shield: 1, science: 1 },
      ]) {
        const explanation = explainTurn({ site, allocation, event, dose: { incoming: 1, blocked: 0, received: 1 },
          due: [], airShortfall: 0, recovery: 0, brownout: false, scienceGained: 0, finalDay: false, underfunded: false });
        expect(explanation.power.startsWith('In our game')).toBe(true);
        expect(explanation.power.split(/\s+/).length).toBeLessThanOrEqual(15);
      }
    }
  });
});

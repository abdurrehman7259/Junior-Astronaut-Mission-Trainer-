import { expect, it } from 'vitest';
import { applyTurn, createGame, drawEventSet } from '../../src/engine';
import { EVENTS } from './fixtures/events';

// Descriptive early signal for B3, not targets that constrain later balancing.
const policies = {
  'all-shield (0/10/0)': { life: 0, shield: 10, science: 0 },
  'all-science (0/0/10)': { life: 0, shield: 0, science: 10 },
  'balanced (4/3/3)': { life: 4, shield: 3, science: 3 },
  'all-life (10/0/0)': { life: 10, shield: 0, science: 0 },
};
const report = Object.entries(policies).map(([policy, allocation]) => {
  let won = 0;
  let ended = 0;
  let science = 0;
  for (let seed = 1; seed <= 20; seed++) {
    let state = createGame(seed, drawEventSet(EVENTS, seed, []));
    while (state.status === 'playing') state = applyTurn(state, allocation).state;
    if (state.status === 'won') won++;
    else ended++;
    science += state.scienceScore;
  }
  return { policy, won, ended, meanScience: science / 20 };
});

it.each(report)('fixture seeds 1–20: $policy — $won won, $ended ended, mean science $meanScience', row => {
  expect(row.won + row.ended).toBe(20);
  expect(row.meanScience).toBeGreaterThanOrEqual(0);
});

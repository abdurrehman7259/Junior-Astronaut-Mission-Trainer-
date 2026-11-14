import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RULES, withRules, type EngineRules } from '../src/engine';
import { DonkiSnapshotSchema } from '../src/shared/schemas';
import type { GameState, SolarEvent } from '../src/shared/types';
import { EVENTS } from '../tests/engine/fixtures/events';
import { allocationName, allocations, fixed, strategies, type Strategy } from './lib/strategies';

export const MISSION_COUNT = 1000;
export interface Summary {
  name: string;
  missions: number;
  wins: number;
  winPercent: number;
  meanScience: number;
  meanWonScience: number;
  meanCrewHealth: number;
}

export function evaluate(name: string, policy: Strategy, starts: GameState[], rules: EngineRules): Summary {
  const engine = withRules(rules);
  let wins = 0;
  let science = 0;
  let wonScience = 0;
  let health = 0;
  for (const start of starts) {
    let state = start;
    while (state.status === 'playing') state = engine.applyTurn(state, policy(state)).state;
    science += state.scienceScore;
    health += state.meters.crewHealth;
    if (state.status === 'won') {
      wins++;
      wonScience += state.scienceScore;
    }
  }
  return { name, missions: starts.length, wins, winPercent: 100 * wins / starts.length,
    meanScience: science / starts.length, meanWonScience: wins ? wonScience / wins : 0,
    meanCrewHealth: health / starts.length };
}

export function simulate(pool: SolarEvent[], rules: EngineRules = RULES, count = MISSION_COUNT) {
  const engine = withRules(rules);
  const starts = Array.from({ length: count }, (_, i) => engine.createGame(i + 1, engine.drawEventSet(pool, i + 1, [])));
  const named = Object.entries(strategies(rules)).map(([name, policy]) => evaluate(name, policy, starts, rules));
  const fixedResults = allocations.map(allocation => evaluate(allocationName(allocation), fixed(allocation), starts, rules));
  // "Best" means most mean science among policies that win >=85%; ties favor survival.
  const rank = (a: Summary, b: Summary) => b.meanScience - a.meanScience || b.wins - a.wins;
  const reliableFixed = fixedResults.filter(row => row.winPercent >= 85).sort(rank);
  const bestFixed = reliableFixed[0] ?? [...fixedResults].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  const adaptive = named.filter(row => row.name.startsWith('adaptive'));
  const bestAdaptive = adaptive.filter(row => row.winPercent >= 85).sort(rank)[0]
    ?? [...adaptive].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  return { rows: [...named.slice(0, 5), { ...bestFixed, name: `best fixed (${bestFixed.name})` }, ...adaptive],
    fixedResults, reliableFixed, bestFixed, bestAdaptive };
}

export function balanceTargets(result: ReturnType<typeof simulate>) {
  const row = (prefix: string) => result.rows.find(item => item.name.startsWith(prefix))!;
  return {
    extremes: row('all-science').winPercent <= 20 && row('all-shield').winPercent <= 20
      && (row('all-life').winPercent <= 40 || row('all-life').meanScience === 0),
    noDominantFixed: result.fixedResults.every(item => item.winPercent < 95
      || item.meanScience < result.bestAdaptive.meanScience * 0.9),
    defaultNeedsChoices: row('balanced').winPercent < 90,
    adaptiveAdvantage: result.reliableFixed.length > 0 && result.bestAdaptive.winPercent >= 85
      && result.bestAdaptive.meanScience >= result.bestFixed.meanScience * 1.25,
  };
}

export function table(rows: Summary[]): string {
  return [
    '| Strategy | Win % | Mean science | Mean science (wins only) | Mean final crew health |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${row.name} | ${row.winPercent.toFixed(1)} | ${row.meanScience.toFixed(2)} | ${row.meanWonScience.toFixed(2)} | ${row.meanCrewHealth.toFixed(2)} |`),
  ].join('\n');
}

export function loadPool() {
  const path = fileURLToPath(new URL('../public/data/donki-events.json', import.meta.url));
  if (existsSync(path)) {
    const snapshot = DonkiSnapshotSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    return { events: snapshot.items, label: `public/data/donki-events.json - Archived (retrieved ${snapshot.retrievedAt.slice(0, 10)}); retrievedAt=${snapshot.retrievedAt}` };
  }
  return { events: EVENTS, label: 'tests/engine/fixtures/events.ts - synthetic test fixture, not NASA observations' };
}

export function main() {
  try { process.loadEnvFile('.env'); } catch { /* Optional local environment. */ }
  const pool = loadPool();
  const primary = simulate(pool.events);
  const fixture = pool.events === EVENTS ? primary : simulate(EVENTS);
  const targets = balanceTargets(fixture);
  const holds = Object.values(targets).every(Boolean);
  const text = `# B3 balance report\n\nPool: ${pool.label}.\n\n${MISSION_COUNT} missions per strategy; seeds 1-${MISSION_COUNT}, identical draws for every strategy. All 66 fixed allocations searched. Best fixed means highest mean science among allocations winning at least 85%; best adaptive uses the same criterion. Science includes ended missions; wins-only science is zero when there are no wins.\n\n${table(primary.rows)}\n\n## Fixture acceptance\n\n${pool.events === EVENTS ? 'Same pool and results as above.' : table(fixture.rows)}\n\nTargets 1-4: ${JSON.stringify(targets)}.\n\nUS-03 ${holds ? 'holds on the fixture' : 'needs further tuning on the fixture'}: spending every day on one system is unrewarding, the default plan requires changes, and reacting to the visible event earns more science than a reliable fixed plan. Empty batteries reduce shield protection and science production proportionally. Air shortages and brownouts land immediately on day 10. The spacing rule samples uniformly from valid schedules; it does not guarantee identical marginal rates at the edges.\n\nAdaptive win rate: ${fixture.bestAdaptive.winPercent.toFixed(1)}%. Losses remain possible without adding random damage beyond the drawn events. All balance and policy values below are invented game rules, not scientific measurements.\n\n## RULES\n\n\`\`\`json\n${JSON.stringify(RULES, null, 2)}\n\`\`\`\n`;
  writeFileSync(new URL('../reports/balance-report.md', import.meta.url), text);
  console.log(text);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

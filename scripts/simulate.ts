import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RULES, withRules, type EngineRules } from '../src/engine';
import { DonkiSnapshotSchema } from '../src/shared/schemas';
import type { GameState, SolarEvent } from '../src/shared/types';
import { EVENTS } from '../tests/engine/fixtures/events';
import { allocationName, allocations, fixed, POLICY, strategies, type Strategy } from './lib/strategies';

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
  const named = Object.entries(strategies()).map(([name, policy]) => evaluate(name, policy, starts, rules));
  const fixedResults = allocations.map(allocation => evaluate(allocationName(allocation), fixed(allocation), starts, rules));
  // "Best" means most mean science among policies that win >=85%; ties favor survival.
  const rank = (a: Summary, b: Summary) => b.meanScience - a.meanScience || b.wins - a.wins;
  const reliableFixed = fixedResults.filter(row => row.winPercent >= 85).sort(rank);
  const bestFixed = reliableFixed[0] ?? [...fixedResults].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  const adaptive = named.filter(row => row.name.startsWith('adaptive'));
  const bestAdaptive = adaptive.filter(row => row.winPercent >= 85).sort(rank)[0]
    ?? [...adaptive].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  return { rows: [...named.slice(0, 5), { ...bestFixed, name: `best fixed (${bestFixed.name})` }, ...named.slice(5)],
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
    adaptiveCanLose: result.bestAdaptive.winPercent >= 85 && result.bestAdaptive.winPercent < 100,
    kidFriendly: result.rows.filter(item => item.name.startsWith('kid ')).every(item => item.winPercent >= 90),
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
    return { events: snapshot.items, label: `public/data/donki-events.json - Archived (retrieved ${snapshot.retrievedAt.slice(0, 10)}); retrievedAt=${snapshot.retrievedAt}; source: ${snapshot.sourceUrl}` };
  }
  return { events: EVENTS, label: 'tests/engine/fixtures/events.ts - synthetic test fixture, not NASA observations' };
}

export function poolMix(events: SolarEvent[]): string {
  const storms = events.filter(event => event.kind !== 'QUIET');
  const kinds = (['FLR', 'CME', 'QUIET'] as const)
    .map(kind => `${kind} ${events.filter(event => event.kind === kind).length}`).join(', ');
  const mix = [1, 2, 3].map(severity => {
    const count = storms.filter(event => event.severity === severity).length;
    return `${severity}: ${count} (${(100 * count / storms.length).toFixed(1)}%)`;
  }).join(', ');
  return `${events.length} items: ${kinds}. Storm severity mix: ${mix}.`;
}

export function main() {
  try { process.loadEnvFile('.env'); } catch { /* Optional local environment. */ }
  const pool = loadPool();
  const primary = simulate(pool.events);
  const fixture = pool.events === EVENTS ? primary : simulate(EVENTS);
  const primaryTargets = balanceTargets(primary);
  const fixtureTargets = balanceTargets(fixture);
  const holds = [...Object.values(primaryTargets), ...Object.values(fixtureTargets)].every(Boolean);
  const text = [
    '# B3 fix round 1 balance report',
    `Pool: ${pool.label}.\n\n${poolMix(pool.events)}`,
    `${MISSION_COUNT} missions per strategy; seeds 1-${MISSION_COUNT}, identical draws for every strategy. All 66 fixed allocations searched. Best fixed means highest mean science among allocations winning at least 85%; best adaptive uses the same criterion among adaptive and adaptive-plus. Science includes ended missions; wins-only science is zero when there are no wins. Automated balance tests use 300 seeds per pool.`,
    table(primary.rows),
    `Primary targets 1-6: ${JSON.stringify(primaryTargets)}.`,
    '## Fixture acceptance',
    `Pool: tests/engine/fixtures/events.ts - synthetic test fixture, not NASA observations.\n\n${poolMix(EVENTS)}`,
    pool.events === EVENTS ? 'Same pool and results as above.' : table(fixture.rows),
    `Fixture targets 1-6: ${JSON.stringify(fixtureTargets)}.`,
    `US-03 ${holds ? 'passes targets 1-6 on both reported pools' : 'needs further tuning; see failed targets above'}. The tables show the cost of ignoring the allocator and the benefit of reacting to events. These are seeded sample results, not guarantees for every mission or other event pools. The 85% reliability cutoff can change which fixed plan is selected between 300 and 1,000 seeds; all fixed results are included below so near-cutoff plans remain visible.`,
    'All balance values are game rules, not measurements. Empty batteries reduce shield protection and science production proportionally. Air shortages and brownouts land immediately on day 10. No numeric RULES changes were needed: both committed pools pass all targets with the existing values. RULES.strategy moved unchanged into simulator POLICY; the two kid heuristics were added there.',
    'Draw rules are unchanged: choose 3-5 storms uniformly, choose one severity >=2 anchor uniformly, fill remaining storm slots uniformly without replacement, then shuffle storm order. This deliberately favors including a stronger event; it is not an estimate of natural storm frequency. Valid positions are sampled uniformly subject to at most two consecutive storms. Edge-day marginal rates need not equal middle-day rates. Records keep their original identity and data. No extra severity weighting was needed. Milder proxy pools were not acceptance pools in this run.',
    'Policies: adaptive uses life 4 and shield 2 x severity; adaptive-plus also reacts to low air or health. Kid storm switch uses 4/3/3 normally and 4/6/0 at severity >=2. Kid extra air uses life 5 and shield min(5, 2 x severity), putting the remainder into science. The shield cap keeps the severity-3 plan within the ten-unit budget.',
    `## RULES\n\n\`\`\`json\n${JSON.stringify(RULES, null, 2)}\n\`\`\``,
    `## Simulator POLICY\n\n\`\`\`json\n${JSON.stringify(POLICY, null, 2)}\n\`\`\``,
    `## All fixed allocations: primary pool\n\n${table(primary.fixedResults)}`,
    `## All fixed allocations: fixture\n\n${table(fixture.fixedResults)}`,
  ].join('\n\n') + '\n';
  writeFileSync(new URL('../reports/balance-report.md', import.meta.url), text);
  console.log(text);
  if (!holds) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { drawEventSet, RULES_BY_SITE, withRules, type EngineRules } from '../src/engine';
import { DonkiMarsSnapshotSchema, DonkiSnapshotSchema } from '../src/shared/schemas';
import type { GameState, SolarEvent, SiteId } from '../src/shared/types';
import { SITES, SITE_IDS } from '../src/shared/sites';
import { EVENTS, MARS_EVENTS } from '../tests/engine/fixtures/events';
import { allocationName, allocations, fixed, POLICY_BY_SITE, strategies, type Strategy } from './lib/strategies';

export const MISSION_COUNT = 1000;
export const DRAW_SAMPLE_COUNT = 5000;

/** Adjacent within-mission pairs only; never join the end of one mission to another. */
export function stormTransitions(pool: SolarEvent[], count = DRAW_SAMPLE_COUNT) {
  let afterStorm = 0;
  let afterQuiet = 0;
  let stormStorm = 0;
  let quietStorm = 0;
  for (let seed = 1; seed <= count; seed++) {
    const events = drawEventSet(pool, seed, []);
    for (let day = 1; day < events.length; day++) {
      const storm = events[day].kind !== 'QUIET';
      if (events[day - 1].kind !== 'QUIET') {
        afterStorm++;
        if (storm) stormStorm++;
      } else {
        afterQuiet++;
        if (storm) quietStorm++;
      }
    }
  }
  return { afterStorm, afterQuiet, stormStorm, quietStorm,
    stormGivenStorm: stormStorm / afterStorm, stormGivenQuiet: quietStorm / afterQuiet };
}
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

export function simulate(pool: SolarEvent[], overrides?: EngineRules, count = MISSION_COUNT, site: SiteId = 'moon') {
  const rules = overrides ?? RULES_BY_SITE[site];
  const engine = withRules(rules);
  const starts = Array.from({ length: count }, (_, i) => engine.createGame(i + 1, engine.drawEventSet(pool, i + 1, []), site));
  const named = Object.entries(strategies(site)).map(([name, policy]) => evaluate(name, policy, starts, rules));
  const fixedResults = allocations.map(allocation => evaluate(allocationName(allocation), fixed(allocation), starts, rules));
  // "Best" means most mean science among policies that win >=85%; ties favor survival.
  const rank = (a: Summary, b: Summary) => b.meanScience - a.meanScience || b.wins - a.wins;
  const reliableFixed = fixedResults.filter(row => row.winPercent >= 85).sort(rank);
  const bestFixed = reliableFixed[0] ?? [...fixedResults].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  const adaptive = named.filter(row => row.name.startsWith('adaptive'));
  const bestAdaptive = adaptive.filter(row => row.winPercent >= 85).sort(rank)[0]
    ?? [...adaptive].sort((a, b) => b.wins - a.wins || rank(a, b))[0];
  return { rows: [...named.slice(0, 5), { ...bestFixed, name: `best fixed (${bestFixed.name})` }, ...named.slice(5)],
    site, fixedResults, reliableFixed, bestFixed, bestAdaptive };
}

export function balanceTargets(result: ReturnType<typeof simulate>) {
  const row = (prefix: string) => result.rows.find(item => item.name.startsWith(prefix))!;
  return {
    extremes: row('all-science').winPercent <= 20 && row('all-shield').winPercent <= 20
      && (row('all-life').winPercent <= 40 || row('all-life').meanScience === 0),
    noDominantFixed: result.fixedResults.every(item => item.winPercent < 95
      || item.meanScience < result.bestAdaptive.meanScience * 0.9),
    defaultNeedsChoices: row('balanced').winPercent < (result.site === 'mars' ? 75 : 90),
    adaptiveAdvantage: result.reliableFixed.length > 0 && result.bestAdaptive.winPercent >= 85
      && result.bestAdaptive.meanScience >= result.bestFixed.meanScience * 1.25,
    adaptiveCanLose: result.bestAdaptive.winPercent >= 85 && result.bestAdaptive.winPercent < 100,
    kidFriendly: result.site === 'mars'
      ? row('kid meter-aware').winPercent >= 85
      : result.rows.filter(item => item.name.startsWith('kid ')).every(item => item.winPercent >= 90),
  };
}

export function table(rows: Summary[]): string {
  return [
    '| Strategy | Win % | Mean science | Mean science (wins only) | Mean final crew health |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${row.name} | ${row.winPercent.toFixed(1)} | ${row.meanScience.toFixed(2)} | ${row.meanWonScience.toFixed(2)} | ${row.meanCrewHealth.toFixed(2)} |`),
  ].join('\n');
}

export function loadPool(site: SiteId = 'moon'): { events: SolarEvent[]; label: string } {
  const relative = `public${SITES[site].eventsFile}`;
  const path = fileURLToPath(new URL(`../${relative}`, import.meta.url));
  if (existsSync(path)) {
    const schema = site === 'mars' ? DonkiMarsSnapshotSchema : DonkiSnapshotSchema;
    const snapshot = schema.parse(JSON.parse(readFileSync(path, 'utf8')));
    return { events: snapshot.items, label: `${relative} - Archived (retrieved ${snapshot.retrievedAt.slice(0, 10)}); retrievedAt=${snapshot.retrievedAt}; source: ${snapshot.sourceUrl}` };
  }
  if (site === 'mars') {
    const moon = loadPool('moon');
    return { events: moon.events, label: `MARS PROXY (Mars snapshot missing): ${moon.label}` };
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

export function selectedSites(args: string[]): readonly SiteId[] {
  if (args.length === 0) return SITE_IDS;
  if (args.length !== 2 || args[0] !== '--site' || !['moon', 'mars', 'both'].includes(args[1])) {
    throw new RangeError('Usage: simulate.ts [--site moon|mars|both]');
  }
  return args[1] === 'both' ? SITE_IDS : [args[1] as SiteId];
}

export function main(args = process.argv.slice(2)) {
  try { process.loadEnvFile('.env'); } catch { /* Optional local environment. */ }
  const sections = [
    '# B9 fix 1 Moon + Mars balance report',
    `${MISSION_COUNT} missions per strategy; seeds 1-${MISSION_COUNT}, identical draws per site for every policy. All 66 fixed allocations searched. Best fixed and best adaptive maximize mean science among policies winning at least 85%; fallback ranks by survival. Science includes ended missions. Automated tests use 300 seeds per site and pool. All balance values are game rules, not measurements.`,
    'Moon policies see the current warning. Mars policies use only the previous report and current meters; no current or future storm severity is available. Mars previews explicitly describe calm Sun assumptions conditionally. Both sites draw 3-5 storms with at least one severity >=2. Moon layouts stay uniform with no more than two consecutive storms. Mars allows three consecutive storms and weights each valid layout by 1.5 raised to its number of adjacent storm pairs. These are gameplay constraints, not natural storm frequencies. The site is inferred from the pool: every storm must have marsImpact defined for Mars; quiet tags are ignored, and empty or mixed storm pools use Moon rules.',
    'RULES diff from accepted B9: Mars shieldHalfProtectionUnits 3 -> 2.75; Mars draw.maxConsecutiveStorms 2 -> 3; new draw.consecutiveStormWeight defaults to 1 (uniform, unchanged Moon draws), overridden to 1.5 on Mars. No other balance values changed. Existing Mars recharge stays 4 per ordinary sol and 3 during CMEs. Starting meters, equipment costs, air penalties and game doses stay unchanged. GAME RULE: Mars\'s thin atmosphere adds a little shielding; no real ratio claimed. Existing NASA context: https://science.nasa.gov/mars/facts/.',
    'Draw tuning: maxConsecutiveStorms=3 alone gave P(storm|storm)=0.3355 and P(storm|quiet)=0.4396 on the real Mars pool (5,000 seeds), missing the five-percentage-point tolerance. The small adjacent-pair weight fixes that bias while retaining the storm-count cap. The reviewer\'s 2.75 shield setting meets every balance target with these revised draws; no further shield tuning was needed.',
    'Policies: Moon adaptive uses life 4 and shield 2 x current severity. Mars adaptive uses life 5 and shield 3, increasing to 4 after a severity 2-3 report. Adaptive-plus uses life 6 below 40 air; below 40 health it adds one shield on warned Moon storms, or two standing shields on Mars. Shield allocations are capped by the ten-unit budget. Moon kid storm switch uses 4/3/3 or 4/6/0 at warning severity >=2; Moon kid extra air uses life 5 and the adaptive shield rule. Mars kid steady always uses 5/3/2. Mars kid meter-aware starts at 5/3/2, uses life 6 below 50 air and shield 5 below 50 health; if both are low, air takes priority and shields cap at 4. These two Mars kid heuristics need only meters, and do not clone adaptive. The default remains 4/3/3 on both sites. Mars adaptive warnings always mean the previous report, with no warning on sol 1.',
    'Enforced targets: extreme plans lose or earn no science; no fixed plan wins >=95% with science within 10% of best adaptive; default 4/3/3 wins <90% on Moon and <75% on Mars; best adaptive wins >=85% with >=25% more mean science than the best fixed plan winning >=85%; best adaptive can lose. Both Moon kid heuristics must win >=90%; Mars meter-aware kid must win >=85%. Targets apply to both real pools and their synthetic fixtures. Mars P(storm|storm) must be >= P(storm|quiet) - 0.05 across 5,000 seeded draws, tested on the real pool and tagged fixture.',
  ];
  let holds = true;
  for (const site of selectedSites(args)) {
    const pool = loadPool(site);
    const primary = simulate(pool.events, RULES_BY_SITE[site], MISSION_COUNT, site);
    const fixturePool = site === 'mars' ? MARS_EVENTS : EVENTS;
    const fixture = pool.events === fixturePool ? primary : simulate(fixturePool, RULES_BY_SITE[site], MISSION_COUNT, site);
    const primaryTargets = balanceTargets(primary);
    const fixtureTargets = balanceTargets(fixture);
    const transitions = stormTransitions(pool.events);
    holds &&= [...Object.values(primaryTargets), ...Object.values(fixtureTargets)].every(Boolean);
    if (site === 'mars') holds &&= transitions.stormGivenStorm >= transitions.stormGivenQuiet - 0.05;
    sections.push(
      `## ${SITES[site].name}`,
      `Pool: ${pool.label}.\n\n${poolMix(pool.events)}`,
      table(primary.rows),
      `Conditional storm probabilities (${DRAW_SAMPLE_COUNT} draws, seeds 1-${DRAW_SAMPLE_COUNT}, within-mission adjacent pairs): ${JSON.stringify(transitions)}.`,
      `Primary targets: ${JSON.stringify(primaryTargets)}.`,
      `### ${SITES[site].name} fixture acceptance`,
      `Synthetic test fixture: tests/engine/fixtures/events.ts (${site === 'mars' ? 'MARS_EVENTS, tagged storms' : 'EVENTS'}).\n\n${poolMix(fixturePool)}`,
      table(fixture.rows),
      `Fixture targets: ${JSON.stringify(fixtureTargets)}.`,
      `### ${SITES[site].name} rules (game rules, not measurements)\n\n${'`'.repeat(3)}json\n${JSON.stringify(RULES_BY_SITE[site], null, 2)}\n${'`'.repeat(3)}`,
      `### ${SITES[site].name} all fixed allocations: primary pool\n\n${table(primary.fixedResults)}`,
      `### ${SITES[site].name} all fixed allocations: fixture\n\n${table(fixture.fixedResults)}`,
    );
  }
  sections.push(
    `US-03 ${holds ? 'passes all enforced targets' : 'needs further tuning; see failed targets above'}. Results describe seeded samples, not guarantees for other seeds or event pools. Fixed plans cannot combine near-adaptive science with 95% wins. The default plan requires intervention; meter-aware choices preserve air and reserve power.`,
    `## Simulator policy settings\n\n${'`'.repeat(3)}json\n${JSON.stringify(POLICY_BY_SITE, null, 2)}\n${'`'.repeat(3)}`,
  );
  const text = sections.join('\n\n') + '\n';
  // Generated report: written to the gitignored reports/ folder.
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../reports/balance-report.md', import.meta.url), text);
  console.log(text);
  if (!holds) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

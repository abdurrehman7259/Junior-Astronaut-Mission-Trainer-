import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchJson, redactApiKey } from './lib/http.js';
import { buildMarsSnapshot, MARS_WINDOW } from './lib/mars.js';

const DAY_MS = 86_400_000;
const day = (date) => Date.parse(`${date}T00:00:00Z`);
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Read-only cache reuse, including split windows. Missing ranges are fetched keylessly, never guessed quiet. */
export async function fetchMarsRecords(cacheDir) {
  let names = [];
  if (cacheDir) {
    try {
      names = await readdir(cacheDir);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  const raw = { FLR: [], CME: [], cachedWindows: 0, fetchedWindows: 0 };
  for (const kind of ['FLR', 'CME']) {
    const ranges = names
      .flatMap((name) => {
        const match = /^(FLR|CME)-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
        if (!match || match[1] !== kind) return [];
        const start = day(match[2]);
        const end = day(match[3]);
        return start >= day(MARS_WINDOW.startDate) &&
          end <= day(MARS_WINDOW.endDate) &&
          end >= start &&
          end - start < 60 * DAY_MS
          ? [{ name, start, end }]
          : [];
      })
      .sort((a, b) => a.start - b.start || b.end - a.end);
    for (let start = day(MARS_WINDOW.startDate); start <= day(MARS_WINDOW.endDate);) {
      const cached = ranges.find((range) => range.start === start);
      const nextCached = ranges.find((range) => range.start > start);
      const end =
        cached?.end ??
        Math.min(start + 59 * DAY_MS, day(MARS_WINDOW.endDate), nextCached ? nextCached.start - DAY_MS : Infinity);
      let records;
      if (cached && cacheDir) {
        records = JSON.parse(await readFile(resolve(cacheDir, cached.name), 'utf8'));
        if (!Array.isArray(records)) throw new Error(`Invalid DONKI cache array: ${cached.name}`);
        raw.cachedWindows++;
      } else {
        const url = new URL(`https://ccmc.gsfc.nasa.gov/DONKI-API/get/${kind}`);
        url.searchParams.set('startDate', dateOf(start));
        url.searchParams.set('endDate', dateOf(end));
        records = await fetchJson(url, { timeoutMs: 90_000 });
        if (!Array.isArray(records)) throw new Error(`DONKI ${kind} ${dateOf(start)} did not return an array`);
        raw.fetchedWindows++;
      }
      raw[kind].push(...records);
      start = end + DAY_MS;
    }
  }
  return raw;
}

export async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* CCMC needs no key. */
  }
  const raw = await fetchMarsRecords(fileURLToPath(new URL('../.cache/donki/', import.meta.url)));
  const { snapshot, pool } = buildMarsSnapshot(
    raw,
    new Date().toISOString(),
    `Reused cached raw .cache/donki CME/FLR responses for ${raw.cachedWindows} windows; fetched ${raw.fetchedWindows} missing windows from keyless CCMC.`,
  );
  await writeFile(
    new URL('../public/data/donki-mars-events.json', import.meta.url),
    JSON.stringify(snapshot, null, 2) + '\n',
  );
  const counts = (events) => ({
    kind: {
      CME: events.filter((e) => e.kind === 'CME').length,
      FLR: 0,
      QUIET: events.filter((e) => e.kind === 'QUIET').length,
    },
    severity: [0, 1, 2, 3].map((s) => events.filter((e) => e.severity === s).length),
  });
  console.log(
    JSON.stringify({
      retrievedAt: snapshot.retrievedAt,
      cachedWindows: raw.cachedWindows,
      fetchedWindows: raw.fetchedWindows,
      pool: counts(pool),
      selected: counts(snapshot.items),
      bytes: Buffer.byteLength(JSON.stringify(snapshot, null, 2) + '\n'),
    }),
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(redactApiKey(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

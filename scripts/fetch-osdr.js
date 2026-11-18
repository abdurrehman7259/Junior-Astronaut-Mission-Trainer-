import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OsdrSnapshotSchema } from '../src/shared/schemas.js';

import { fetchJson, redactApiKey } from './lib/http.js';
import { parseSearchPage, searchUrl, selectFacts, TOPICS } from './lib/osdr.js';

const OUTPUT = fileURLToPath(new URL('../public/data/osdr-facts.json', import.meta.url));

/** Public study pages are HTML; fetchJson cannot consume them. GET and cancel
 * the body after checking status. API JSON requests use the shared retry helper.
 */
export async function checkStudyPage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000), redirect: 'error' });
  await response.body?.cancel();
  if (response.status !== 200) throw new Error(`Study page HTTP ${response.status}: ${url}`);
}

export async function fetchOsdrSnapshot() {
  const studies = [];
  // No credentials needed. Do not parallelize requests to this slow public host.
  for (const topic of TOPICS) {
    let received = 0;
    for (let page = 0; ; page++) {
      const result = parseSearchPage(await fetchJson(searchUrl(topic, page), { timeoutMs: 90_000 }));
      studies.push(...result.studies);
      received += result.studies.length;
      if (received >= result.total) break;
      if (!result.studies.length || page >= 99) throw new Error('Incomplete OSDR search pagination');
    }
  }
  const items = selectFacts(studies);
  for (const item of items) await checkStudyPage(item.osdrUrl);
  const retrievedAt = new Date().toISOString();
  return OsdrSnapshotSchema.parse({
    retrievedAt,
    source: 'NASA Open Science Data Repository (OSDR)',
    sourceUrl: 'https://osdr.nasa.gov/bio/',
    notes: `Archived (retrieved ${retrievedAt.slice(0, 10)}). Searched bone, muscle and radiation using the public OSDR Search API (cgene), including all result pages. Selected two description-evidence-reviewed drafts per topic, preferring explicit flight context and clear topic titles, then numeric accession; sorted by numeric accession. Radiation studies include ground-based exposures and simulated deep space radiation, not astronaut flight measurements. Every study page returned HTTP 200. Drafts describe study questions, not inferred results. API documentation: https://api.nasa.gov/`,
    items,
  });
}

export async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* Public API requires no credentials. */
  }
  const snapshot = OsdrSnapshotSchema.parse(await fetchOsdrSnapshot());
  await mkdir(dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, OUTPUT);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(
    `Archived (retrieved ${snapshot.retrievedAt.slice(0, 10)}): ${snapshot.items.length} OSDR facts; ${OUTPUT}`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(redactApiKey(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

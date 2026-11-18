import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MarsSiteInfoSchema } from '../src/shared/schemas.js';

import { redactApiKey } from './lib/http.js';

/** Manually verified NASA passages; these are curated facts, not scraped guesses. */
export const MARS_SITE_SOURCES = [
  {
    title: 'NASA: Perseverance rover location and February 18, 2021 landing',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/location-map/',
  },
  {
    title: 'NASA: Perseverance landing site, ancient Jezero lake',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
  },
  {
    title: 'NASA NTRS: Fassett and Goudge, crater lakes, Table 4 (Jezero coordinates, page 24)',
    url: 'https://ntrs.nasa.gov/api/citations/20210023904/downloads/ANUGAdraft_16_NoLine_ForSTI.pdf',
  },
  {
    title: 'NASA: Barsoom, definition and length of a Martian sol',
    url: 'https://www.nasa.gov/image-article/barsoom/',
  },
  {
    title: 'NASA NTRS: Why Moon to Mars (2025 IAC), one-way light-time, page 3',
    url: 'https://ntrs.nasa.gov/api/citations/20250009282/downloads/2025%20IAC%20-%20Why%20Moon%20and%20Mars%20-%200916%20Edits.pdf',
  },
  {
    title: 'NASA Mars Trek (homepage fallback; no documented Jezero deep-link format verified)',
    url: 'https://trek.nasa.gov/mars/',
  },
];

export function buildMarsSite(retrievedAt) {
  return MarsSiteInfoSchema.parse({
    name: 'Jezero Crater',
    summary: "An ancient lake bed on Mars, Jezero Crater is where NASA's Perseverance rover landed in 2021.",
    // Table 4 gives Jezero basin coordinates, not the rover's landing ellipse or a photo centre.
    latitude: 18.4,
    longitude: 77.7,
    // Allowed fallback: no undocumented query parameters; intentionally opens the globe.
    marsTrekUrl: 'https://trek.nasa.gov/mars/',
    // NASA: "(A sol is a Martian day, which lasts 24 hours, 39 minutes, 35 seconds)."
    solLength: '24 hours, 39 minutes, 35 seconds',
    // IAC 2025, page 3: one-way light-time communications delay between 4 and 24 minutes.
    lightTimeMinutes: { min: 4, max: 24 },
    sources: MARS_SITE_SOURCES,
    retrievedAt,
  });
}

/** Fetch each citation now and require HTTP 200 before dating or writing the snapshot. */
export async function fetchMarsSite() {
  for (const source of MARS_SITE_SOURCES) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`NASA source returned HTTP ${response.status}: ${source.url}`);
    }
    const body = await response.text();
    if (source.url.endsWith('.pdf')) {
      if (!body.startsWith('%PDF-')) throw new Error(`Expected NASA PDF: ${source.url}`);
    } else {
      const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const expected = source.url.endsWith('/location-map/')
        ? /landed in Jezero Crater.*Feb\. 18, 2021/i
        : source.url === MARS_SITE_SOURCES[1].url
          ? /river channels spilled over the crater wall and created a lake/i
          : source.url.includes('/barsoom/')
            ? /24 hours, 39 minutes, 35 seconds/i
            : /Mars Trek/;
      if (!expected.test(text)) throw new Error(`NASA source passage changed; review before updating: ${source.url}`);
    }
    console.log(`NASA source HTTP 200: ${source.url}`);
  }
  return buildMarsSite(new Date().toISOString());
}

export async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* Public NASA sources need no key. */
  }
  const site = await fetchMarsSite();
  await writeFile(new URL('../public/data/mars-site.json', import.meta.url), JSON.stringify(site, null, 2) + '\n');
  console.log(
    `Archived (retrieved ${site.retrievedAt.slice(0, 10)}): Jezero facts validated; Mars Trek homepage fallback; optional image omitted (no verified public-domain asset selected).`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(redactApiKey(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DoseCalibrationSchema } from '../src/shared/schemas';
import type { DoseCalibration } from '../src/shared/types';
import { fetchJson, redactApiKey } from './lib/http';
import { averageDailyDoseRate, INSTRUMENT_ID, parseDailyDoseReadings, PERIOD, radlabUrl } from './lib/radlab';

const OUTPUT = fileURLToPath(new URL('../public/data/radlab-dose.json', import.meta.url));

export async function fetchDoseCalibration(): Promise<DoseCalibration> {
  const sourceUrl = radlabUrl();
  // Public OSDR API needs no key. Shared HTTP helper supplies sequential retries/backoff.
  const raw = await fetchJson(sourceUrl);
  const retrievedAt = new Date().toISOString();
  const rate = averageDailyDoseRate(parseDailyDoseReadings(raw), PERIOD.startDate, PERIOD.endDateExclusive);
  // Magnetic protection context:
  // https://www.nasa.gov/humans-in-space/step-3-artemis-moon-missions-as-an-astronaut-testbed-for-mars/
  // https://science.nasa.gov/moon/solar-wind/
  return DoseCalibrationSchema.parse({
    issDoseRateMicroGyPerDay: Math.round(rate), retrievedAt,
    source: 'NASA RadLab (OSDR), preliminary NASA/LBNL ISS radiation dosimetry',
    sourceUrl,
    note: `Archived (retrieved ${retrievedAt.slice(0, 10)}): ${INSTRUMENT_ID} in Columbus, mean of daily absorbed-dose rates for 2024-01-18–2024-01-24 UTC (preliminary data). The ISS is inside Earth's protective magnetic field; the Moon's surface lacks that protection, so lunar radiation exposure is higher.`,
  });
}

export async function main(): Promise<void> {
  try { process.loadEnvFile('.env'); } catch { /* Public API requires no credentials. */ }
  const snapshot = await fetchDoseCalibration();
  // Validate before touching the existing snapshot; replace it atomically.
  const json = `${JSON.stringify(DoseCalibrationSchema.parse(snapshot), null, 2)}\n`;
  await mkdir(dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, OUTPUT);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Archived (retrieved ${snapshot.retrievedAt.slice(0, 10)}): ${snapshot.issDoseRateMicroGyPerDay} µGy/day; ${OUTPUT}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(redactApiKey(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

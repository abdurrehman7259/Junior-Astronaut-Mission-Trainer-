import { z } from 'zod';

export const RADLAB_API = 'https://visualization.osdr.nasa.gov/radlab/api/';
// Daily preliminary NASA/LBNL series, rather than mixing detectors or cadences:
// https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/Release_history
export const INSTRUMENT_ID = 'REM-COL1A2-pre';
export const PERIOD = { startDate: '2024-01-18', endDateExclusive: '2024-01-25' };

const tableSchema = z.object({
  columns: z.array(z.string()),
  data: z.array(z.array(z.unknown())),
});
const dateSchema = z.iso.date();
const dayMs = 86_400_000;

export function radlabUrl() {
  const url = new URL(RADLAB_API);
  url.search = new URLSearchParams({
    spacecraft: 'ISS',
    instrument_id: INSTRUMENT_ID,
    'timestamp>': PERIOD.startDate,
    'timestamp<': PERIOD.endDateExclusive,
    absorbed_dose_rate: '',
    format: 'json',
  }).toString();
  return url.href;
}

/** Parse RadLab's split JSON table; do not coerce missing rates to zero. */
export function parseDailyDoseReadings(raw) {
  const { columns, data } = tableSchema.parse(raw);
  if (new Set(columns).size !== columns.length) throw new Error('Duplicate RadLab columns');
  const required = ['timestamp', 'instrument_id', 'absorbed_dose_rate', 'spacecraft'];
  for (const field of required) {
    if (!columns.includes(field)) throw new Error(`Missing RadLab column: ${field}`);
  }
  const at = (row, field) => row[columns.indexOf(field)];
  return data.map((row) => {
    if (row.length !== columns.length) throw new Error('Malformed RadLab row');
    if (at(row, 'instrument_id') !== INSTRUMENT_ID || at(row, 'spacecraft') !== 'ISS') {
      throw new Error('Unexpected RadLab instrument or spacecraft');
    }
    const timestamp = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T00:00:00(?:Z)?$/)
      .parse(at(row, 'timestamp'));
    const date = dateSchema.parse(timestamp.slice(0, 10));
    const microGyPerHour = z.number().nonnegative().parse(at(row, 'absorbed_dose_rate'));
    return { date, microGyPerHour };
  });
}

export function microGyPerHourToPerDay(rate) {
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Invalid absorbed dose rate');
  // RadLab API units: https://visualization.osdr.nasa.gov/radlab/gui/data-api/
  // (µGy / hour) × (24 hours / day) = µGy / day; no Sv-to-Gy conversion.
  const converted = rate * 24;
  if (!Number.isFinite(converted)) throw new Error('Dose conversion overflow');
  return converted;
}

/** Equal weights are valid only for this daily series: require every UTC day. */
export function averageDailyDoseRate(readings, startDate, endDateExclusive) {
  const start = Date.parse(`${dateSchema.parse(startDate)}T00:00:00Z`);
  const end = Date.parse(`${dateSchema.parse(endDateExclusive)}T00:00:00Z`);
  const days = (end - start) / dayMs;
  if (days < 7) throw new Error('Dose average requires at least seven days');
  const byDate = new Map();
  for (const reading of readings) {
    dateSchema.parse(reading.date);
    // Enforce our half-open period locally too: upstream boundary semantics vary.
    if (reading.date < startDate || reading.date >= endDateExclusive) continue;
    if (byDate.has(reading.date)) throw new Error(`Duplicate daily dose: ${reading.date}`);
    microGyPerHourToPerDay(reading.microGyPerHour); // Validate before aggregation.
    byDate.set(reading.date, reading.microGyPerHour);
  }
  let mean = 0;
  for (let time = start; time < end; time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    const rate = byDate.get(date);
    if (rate === undefined) throw new Error(`Missing daily dose: ${date}`);
    mean += rate / days;
  }
  return microGyPerHourToPerDay(mean);
}

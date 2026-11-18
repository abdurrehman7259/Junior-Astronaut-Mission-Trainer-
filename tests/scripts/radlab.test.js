import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoseCalibrationSchema } from '../../src/shared/schemas.js';
import { fetchDoseCalibration } from '../../scripts/fetch-radlab.js';
import {
  averageDailyDoseRate,
  INSTRUMENT_ID,
  microGyPerHourToPerDay,
  parseDailyDoseReadings,
  PERIOD,
  radlabUrl,
} from '../../scripts/lib/radlab.js';

// Synthetic daily readings exercise calculations, not a substitute NASA dataset.
const readings = Array.from({ length: 7 }, (_, i) => ({
  date: `2024-01-${18 + i}`,
  microGyPerHour: i + 1,
}));
const table = () => ({
  columns: ['spacecraft', 'absorbed_dose_rate', 'instrument_id', 'timestamp'],
  data: readings.map((r) => ['ISS', r.microGyPerHour, INSTRUMENT_ID, `${r.date}T00:00:00`]),
});
const average = (rows = readings) => averageDailyDoseRate(rows, PERIOD.startDate, PERIOD.endDateExclusive);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RadLab daily calibration', () => {
  it('parses split JSON using column names, not fixed offsets', () => {
    expect(parseDailyDoseReadings(table())).toEqual(readings);
  });
  it.each([
    {},
    { columns: [], data: [] },
    { columns: ['timestamp', 'timestamp'], data: [] },
    { ...table(), data: [['ISS']] },
    { ...table(), data: [['ISS', null, INSTRUMENT_ID, '2024-01-18T00:00:00']] },
    { ...table(), data: [['ISS', '2', INSTRUMENT_ID, '2024-01-18T00:00:00']] },
    { ...table(), data: [['Moon', 2, INSTRUMENT_ID, '2024-01-18T00:00:00']] },
    { ...table(), data: [['ISS', 2, 'other', '2024-01-18T00:00:00']] },
    { ...table(), data: [['ISS', 2, INSTRUMENT_ID, '2024-02-30T00:00:00']] },
    { ...table(), data: [['ISS', 2, INSTRUMENT_ID, '2024-01-18T12:00:00']] },
  ])('rejects malformed, missing or unexpected data %#', (raw) => {
    expect(() => parseDailyDoseReadings(raw)).toThrow();
  });
  it('averages seven daily rates equally, regardless of row order', () => {
    // mean(1..7) = 4 µGy/hour × 24 hours/day = 96 µGy/day.
    expect(average([...readings].reverse())).toBe(96);
  });
  it('converts µGy/hour to µGy/day without confusing absorbed and equivalent dose', () => {
    expect(microGyPerHourToPerDay(2.5)).toBe(60);
    expect(microGyPerHourToPerDay(0)).toBe(0);
  });
  it.each([-1, NaN, Infinity, Number.MAX_VALUE])('rejects invalid/overflowing rate %s', (rate) => {
    expect(() => microGyPerHourToPerDay(rate)).toThrow();
  });
  it('rejects gaps, duplicates, empty data, and periods shorter than seven days', () => {
    expect(() => average(readings.slice(1))).toThrow('Missing');
    expect(() => average([...readings, readings[0]])).toThrow('Duplicate');
    expect(() => average([])).toThrow('Missing');
    expect(() => averageDailyDoseRate(readings, '2024-01-18', '2024-01-24')).toThrow('seven');
    expect(() => average([{ ...readings[0], microGyPerHour: NaN }, ...readings.slice(1)])).toThrow();
  });
  it('excludes upstream rows outside the half-open period', () => {
    expect(average([...readings, { date: '2024-01-25', microGyPerHour: 999 }])).toBe(96);
  });
  it('fetches the cited URL and validates/rounds a timestamped archived snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    const fixture = table();
    fixture.data.forEach((row) => {
      row[1] = Number(row[1]) + 0.03;
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = DoseCalibrationSchema.parse(await fetchDoseCalibration());
    expect(snapshot.issDoseRateMicroGyPerDay).toBe(97);
    expect(snapshot.retrievedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(snapshot.note).toContain('Archived (retrieved 2026-11-14)');
    expect(snapshot.note).toContain('2024-01-18–2024-01-24');
    // sourceUrl is the RadLab home page (fact-check); the exact API query stays in the script.
    expect(snapshot.sourceUrl).toBe('https://visualization.osdr.nasa.gov/radlab/');
    expect(fetchMock).toHaveBeenCalledWith(radlabUrl(), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('fails loudly when upstream returns an incomplete period', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...table(), data: [] }))));
    await expect(fetchDoseCalibration()).rejects.toThrow('Missing daily dose');
  });
});

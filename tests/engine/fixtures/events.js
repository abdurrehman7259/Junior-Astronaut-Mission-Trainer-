// Entirely synthetic test records, including dates/classes; never ship these as NASA data.
const severities = [1, 2, 3, 1, 2, 3, 2, 3];
export const EVENTS = [
  ...severities.map((severity, i) => ({
    id: `FIXTURE-STORM-${i}`,
    source: 'DONKI',
    kind: i % 2 === 0 ? 'FLR' : 'CME',
    realDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
    severity,
    ...(i % 2 === 0 ? { flareClass: 'M1.0' } : {}),
    kidText: 'Synthetic storm for engine tests only.',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `FIXTURE-QUIET-${i}`,
    source: 'DONKI',
    kind: 'QUIET',
    realDate: `2024-02-${String(i + 1).padStart(2, '0')}`,
    severity: 0,
    kidText: 'Synthetic quiet day for engine tests only.',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  })),
];

// Synthetic Mars pool: storm tags exercise the production draw-site inference.
export const MARS_EVENTS = EVENTS.map((event) =>
  event.kind === 'QUIET' ? { ...event } : { ...event, marsImpact: 'game-only' },
);

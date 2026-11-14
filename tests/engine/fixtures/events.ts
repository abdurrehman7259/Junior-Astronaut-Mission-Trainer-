import type { Severity, SolarEvent } from '../../../src/shared/types';

// Entirely synthetic test records, including dates/classes; never ship these as NASA data.
const severities: Severity[] = [1, 2, 3, 1, 2, 3, 2, 3];
export const EVENTS: SolarEvent[] = [
  ...severities.map((severity, i): SolarEvent => ({
    id: `FIXTURE-STORM-${i}`, source: 'DONKI', kind: i % 2 === 0 ? 'FLR' : 'CME',
    realDate: `2024-01-${String(i + 1).padStart(2, '0')}`, severity,
    ...(i % 2 === 0 ? { flareClass: 'M1.0' } : {}),
    kidText: 'Synthetic storm for engine tests only.', sourceUrl: 'https://example.invalid/fixture',
  })),
  ...Array.from({ length: 12 }, (_, i): SolarEvent => ({
    id: `FIXTURE-QUIET-${i}`, source: 'DONKI', kind: 'QUIET',
    realDate: `2024-02-${String(i + 1).padStart(2, '0')}`, severity: 0,
    kidText: 'Synthetic quiet day for engine tests only.', sourceUrl: 'https://example.invalid/fixture',
  })),
];

// Synthetic Mars pool: storm tags exercise the production draw-site inference.
export const MARS_EVENTS: SolarEvent[] = EVENTS.map(event => event.kind === 'QUIET'
  ? { ...event } : { ...event, marsImpact: 'game-only' });

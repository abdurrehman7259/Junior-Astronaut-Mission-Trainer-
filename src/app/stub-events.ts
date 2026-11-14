/**
 * PLACEHOLDER EVENTS (NOT REAL DATA). Dev and test use only, until B1 commits
 * public/data/donki-events.json. Ids start with "STUB-" so the UI can flag them,
 * and the data loader never uses them in a production build (see docs/DECISIONS.md D-006).
 */
import type { SolarEvent } from '../shared/types';

const DONKI_HOME = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/';

const make = (n: number, kind: SolarEvent['kind'], severity: SolarEvent['severity']): SolarEvent => ({
  id: `STUB-${kind}-${n}`,
  source: 'DONKI',
  kind,
  realDate: `2000-01-${String(n).padStart(2, '0')}`,
  severity,
  ...(kind === 'FLR' ? { flareClass: severity === 3 ? 'X1.0' : severity === 2 ? 'M1.0' : 'C1.0' } : {}),
  ...(kind === 'CME' ? { cmeSpeedKms: 400 + severity * 400 } : {}),
  kidText: 'Placeholder event. Not real data.',
  sourceUrl: DONKI_HOME,
});

export const STUB_EVENTS: SolarEvent[] = [
  make(1, 'FLR', 3),
  make(2, 'FLR', 2),
  make(3, 'FLR', 1),
  make(4, 'CME', 3),
  make(5, 'CME', 2),
  make(6, 'CME', 1),
  ...Array.from({ length: 10 }, (_, i) => make(10 + i, 'QUIET', 0)),
];

export const isStubEvent = (e: Pick<SolarEvent, 'id'>) => e.id.startsWith('STUB-');

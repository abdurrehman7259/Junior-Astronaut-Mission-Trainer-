import { beforeEach, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadPool } from '../../scripts/simulate';
import { EVENTS } from './fixtures/events';

vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(),
}));

const moonEvents = [...EVENTS, ...EVENTS.map(event => ({ ...event, id: `EXTRA-${event.id}` }))];
const snapshot = (mars: boolean) => JSON.stringify({
  retrievedAt: '2026-11-01T12:00:00.000Z', source: 'Synthetic test snapshot',
  sourceUrl: 'https://example.invalid/fixture',
  items: (mars ? EVENTS : moonEvents).map(event => ({ ...event, ...(mars ? { marsImpact: 'game-only' } : {}) })),
});

beforeEach(() => vi.clearAllMocks());

it('loads the Mars pool when present, preserving its archive provenance and impact tags', () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(snapshot(true));
  const pool = loadPool('mars');
  expect(String(vi.mocked(readFileSync).mock.calls[0][0])).toMatch(/donki-mars-events\.json$/);
  expect(pool.label).toContain('public/data/donki-mars-events.json');
  expect(pool.label).toContain('Archived (retrieved 2026-11-01)');
  expect(pool.label).toContain('retrievedAt=2026-11-01T12:00:00.000Z');
  expect(pool.events.every(event => event.marsImpact === 'game-only')).toBe(true);
  expect(writeFileSync).not.toHaveBeenCalled();
});

it('labels a Moon fallback explicitly as a Mars proxy', () => {
  vi.mocked(existsSync).mockImplementation(path => !String(path).endsWith('donki-mars-events.json'));
  vi.mocked(readFileSync).mockReturnValue(snapshot(false));
  const pool = loadPool('mars');
  expect(pool.label).toContain('MARS PROXY (Mars snapshot missing)');
  expect(pool.label).toContain('public/data/donki-events.json');
  expect(pool.events).toEqual(moonEvents);
});

it('labels fixture fallback as synthetic and rejects invalid snapshots instead of hiding them', () => {
  vi.mocked(existsSync).mockReturnValue(false);
  expect(loadPool('moon').label).toContain('synthetic test fixture, not NASA observations');
  expect(loadPool('mars').label).toContain('MARS PROXY');
  expect(loadPool('mars').events).toBe(EVENTS);
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue('{"items":[]}');
  expect(() => loadPool('mars')).toThrow();
});

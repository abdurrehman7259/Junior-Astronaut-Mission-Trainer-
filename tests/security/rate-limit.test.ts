import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { config } from '../../netlify/functions/space-weather';

it('pins the Free-plan edge limit to 30 requests per 60 seconds per IP and domain', () => {
  expect(config).toEqual({
    path: '/.netlify/functions/space-weather',
    rateLimit: {
      action: 'rate_limit', windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'],
    },
  });
  // A path is required for code-based limiting; preserve the existing browser URL.
  const live = readFileSync(new URL('../../src/app/live.ts', import.meta.url), 'utf8');
  expect(live.match(/LIVE_ENDPOINT\s*=\s*'([^']+)'/)?.[1]).toBe(config.path);
});

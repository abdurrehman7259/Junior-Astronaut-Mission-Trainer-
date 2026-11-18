import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedLinkUrl } from '../../src/shared/schemas.js';

// Security audit F3: links built from data must be https on nasa.gov / noaa.gov or their subdomains.
describe('isAllowedLinkUrl', () => {
  it.each([
    'https://nasa.gov/',
    'https://www.nasa.gov/image-article/barsoom/',
    'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/28440/-1',
    'https://osdr.nasa.gov/bio/repo/data/studies/OSD-21',
    'https://noaa.gov/',
    'https://www.swpc.noaa.gov/phenomena/coronal-mass-ejections',
  ])('allows %s', (u) => expect(isAllowedLinkUrl(u)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'http://www.nasa.gov/',
    'https://evilnasa.gov/',
    'https://nasa.gov.evil.com/',
    'https://evil.com/?u=https://nasa.gov',
    'https://user:pw@www.nasa.gov/',
    'https://nasa.gov./',
    'data:text/html,hi',
    '//nasa.gov/',
    'not a url',
  ])('rejects %s', (u) => expect(isAllowedLinkUrl(u)).toBe(false));

  it('accepts every link in public/data/*.json', () => {
    const dir = join(__dirname, '../../public/data');
    const links = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      links.push(...(readFileSync(join(dir, f), 'utf8').match(/https?:\/\/[^"\s]+/g) ?? []));
    }
    expect(links.length).toBeGreaterThan(100);
    const bad = links.filter((u) => !isAllowedLinkUrl(u));
    expect(bad).toEqual([]);
  });
});

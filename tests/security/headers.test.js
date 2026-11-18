import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// D-040: the site is hosted on Vercel; vercel.json applies these headers to every route.
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

const all = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
function header(name) {
  return all.find((h) => h.key === name)?.value;
}

describe('deployed header configuration', () => {
  it('sets one-year HSTS without extending it to unverified subdomains or preload', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000');
  });

  it('requires exact strict CSP directives for all paths', () => {
    const csp = header('Content-Security-Policy');
    expect(csp).toBeDefined();
    const entries = csp.split(';').map((part) => part.trim().split(/\s+/));
    const directives = new Map(entries.map(([key, ...tokens]) => [key, tokens]));
    expect(directives.size).toBe(entries.length);
    // connect-src: our host only. The live banner reaches NASA through the same-origin proxy server/donki.js (D-041).
    expect(directives.get('connect-src')).toEqual(["'self'"]);
    expect(csp).not.toContain('ccmc.gsfc.nasa.gov');
    for (const name of ['default-src', 'script-src', 'base-uri', 'form-action']) {
      expect(directives.get(name), name).toEqual(["'self'"]);
    }
    for (const name of ['object-src', 'frame-ancestors']) expect(directives.get(name), name).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https:\/\/api\.nasa\.gov/);
  });

  it('sets the remaining privacy and anti-framing headers on all paths', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    const permissions = header('Permissions-Policy')
      .split(',')
      .map((part) => part.trim());
    for (const name of ['camera', 'microphone', 'geolocation']) expect(permissions).toContain(`${name}=()`);
  });

  it('deploys as a Next.js app and runs the security proof suite in CI after building', () => {
    const cfg = vercel;
    expect(cfg.framework).toBe('nextjs');
    expect(cfg.outputDirectory).toBeUndefined();
    const next = readFileSync(new URL('../../next.config.mjs', import.meta.url), 'utf8');
    expect(next).toMatch(/poweredByHeader:\s*false/);
    expect(next).toMatch(/productionBrowserSourceMaps:\s*false/);
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(ci).not.toMatch(/pull_request_target|secrets\./);
    expect(ci.indexOf('run: npm run build')).toBeLessThan(
      ci.indexOf('run: npx vitest run --config tests/security/vitest.config.js'),
    );
    expect(ci).toContain('run: npx vitest run --config tests/security/vitest.config.js');
  });
});

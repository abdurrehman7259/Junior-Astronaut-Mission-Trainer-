import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
const globalHeaders = toml.match(/\[\[headers\]\]\s*for\s*=\s*"\/\*"([\s\S]*?)(?=\n\[\[headers\]\]|$)/)?.[1] ?? '';
function header(name: string): string | undefined {
  return globalHeaders.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
}

describe('deployed header configuration', () => {
  it('sets one-year HSTS without extending it to unverified subdomains or preload', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000');
  });

  it('requires exact strict CSP directives for all paths', () => {
    const csp = header('Content-Security-Policy');
    expect(csp).toBeDefined();
    const entries = csp!.split(';').map((part) => part.trim().split(/\s+/));
    const directives = new Map(entries.map(([key, ...tokens]) => [key, tokens]));
    expect(directives.size).toBe(entries.length);
    for (const name of ['default-src', 'script-src', 'connect-src', 'base-uri', 'form-action']) {
      expect(directives.get(name), name).toEqual(["'self'"]);
    }
    for (const name of ['object-src', 'frame-ancestors']) expect(directives.get(name), name).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https:\/\/api\.nasa\.gov/);
  });

  it('sets the remaining privacy and anti-framing headers on all paths', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    const permissions = header('Permissions-Policy')!.split(',').map((part) => part.trim());
    for (const name of ['camera', 'microphone', 'geolocation']) expect(permissions).toContain(`${name}=()`);
  });

  it('publishes dist only and runs the security proof suite in CI after building', () => {
    expect(toml.match(/^publish\s*=\s*"([^"]+)"/m)?.[1]).toBe('dist');
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(ci).not.toMatch(/pull_request_target|secrets\./);
    expect(ci.indexOf('run: npm run build')).toBeLessThan(ci.indexOf('run: npx vitest run --config tests/security/vitest.config.ts'));
    expect(ci).toContain('run: npx vitest run --config tests/security/vitest.config.ts');
  });
});

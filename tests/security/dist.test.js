import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

// Everything a visitor can download from a Next.js build: the static chunks, the pre-rendered HTML pages and
// the public/ folder. Run after `npm run build`. Failures disclose filenames only.
const root = process.cwd();
const staticFiles = walk(join(root, '.next', 'static'));
const pageFiles = walk(join(root, '.next', 'server', 'pages')).filter((file) => file.endsWith('.html'));
const publicFiles = walk(join(root, 'public'));
const rel = (file) => relative(root, file).replaceAll('\\', '/');
const contents = [...staticFiles, ...pageFiles, ...publicFiles].map((file) => ({ file: rel(file), text: readFileSync(file, 'utf8') }));
// A 40-character token that mixes letters AND digits (real keys do; framework identifiers such as
// "disableSmoothScrollDuringRouteTransition" are letters only), plus known key and secret markers.
const keyLike =
  /(?<![a-z0-9])(?=[a-z0-9]*[0-9])(?=[a-z0-9]*[a-z])[a-z0-9]{40}(?![a-z0-9])|NASA_API_KEY|NEXT_PUBLIC_[A-Z_]*(?:KEY|TOKEN|SECRET)|api_key\s*[=:]|\b(?:gh[pousr]_|github_pat_|AKIA[A-Z0-9]{16}|xox[baprs]-|sk-proj-)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

describe('fresh production output', () => {
  it('exists (run npm run build first)', () => {
    expect(staticFiles.length).toBeGreaterThan(0);
  });

  it('has no source maps or sourceMappingURL comments', () => {
    expect(staticFiles.filter((file) => /\.map$/i.test(file)).map(rel)).toEqual([]);
    expect(contents.filter(({ text }) => text.includes('sourceMappingURL')).map(({ file }) => file)).toEqual([]);
    expect(readFileSync('next.config.mjs', 'utf8')).toMatch(/productionBrowserSourceMaps:\s*false/);
  });

  it('contains no key-like strings or secret variable markers', () => {
    expect(keyLike.test('a1B2'.repeat(10))).toBe(true); // a realistic 40-character key is caught
    expect(keyLike.test('disableSmoothScrollDuringRouteTransition')).toBe(false); // a framework name is not
    expect(keyLike.test('AKIA' + 'A1B2C3D4E5F6G7H8')).toBe(true);
    expect(contents.filter(({ text }) => keyLike.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('ships only the game page, scripts, styles and data, with no private/debug/test files', () => {
    expect(pageFiles.map(rel).sort()).toEqual(['.next/server/pages/404.html', '.next/server/pages/500.html', '.next/server/pages/index.html']);
    expect(publicFiles.map(rel).filter((file) => !/^public\/(?:favicon\.svg|data\/(?:[^/]+\.json|\.gitkeep))$/.test(file))).toEqual([]);
    expect(staticFiles.map(rel).filter((file) => !/\.(?:js|css|woff2?|svg)$/.test(file) && !/_(?:buildManifest|ssgManifest)\.js$/.test(file))).toEqual([]);
  });
});

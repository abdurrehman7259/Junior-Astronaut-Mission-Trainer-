import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

// Inspect all output bytes, including JSON. Failures disclose filenames only.
const files = walk(join(process.cwd(), 'dist'));
const contents = files.map((file) => ({ file: relative(process.cwd(), file).replaceAll('\\', '/'), text: readFileSync(file, 'utf8') }));
const keyLike = /(?<![a-z0-9])[a-z0-9]{40}(?![a-z0-9])|NASA_API_KEY|VITE_[A-Z_]*(?:KEY|TOKEN|SECRET)|api_key\s*[=:]|\b(?:gh[pousr]_|github_pat_|AKIA[A-Z0-9]{16}|xox[baprs]-|sk-proj-)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

describe('fresh production output', () => {
  it('has no source maps or sourceMappingURL comments', () => {
    expect(files.filter((file) => /\.map$/i.test(file))).toEqual([]);
    expect(contents.filter(({ text }) => text.includes('sourceMappingURL')).map(({ file }) => file)).toEqual([]);
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/sourcemap:\s*false/);
  });

  it('contains no key-like strings or secret variable markers', () => {
    expect(keyLike.test('K'.repeat(40))).toBe(true);
    expect(contents.filter(({ text }) => keyLike.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('ships only index HTML, assets and data, with no private/debug/test directories', () => {
    expect(contents.filter(({ file }) => file.endsWith('.html')).map(({ file }) => file)).toEqual(['dist/index.html']);
    expect(contents.filter(({ file }) => !/^dist\/(?:index\.html|favicon\.svg|assets\/[^/]+\.(?:js|css)|data\/(?:[^/]+\.json|\.gitkeep))$/.test(file))
      .map(({ file }) => file)).toEqual([]);
  });
});

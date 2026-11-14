import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type Finding = { file: string; line: number; message: string };

const walk = (path: string): string[] => {
  try {
    return readdirSync(path).flatMap((name) => {
      const full = join(path, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  } catch {
    return [];
  }
};

export function scanOrigins(file: string, content: string, serverFunction = false): Finding[] {
  const findings: Finding[] = [];
  const normalizedFile = file.replaceAll('\\', '/');
  const built = normalizedFile.startsWith('dist/') || normalizedFile.includes('/dist/');
  content.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(/https?:\/\/[^\s"'<>`)}\]]+/g)) {
      const url = match[0].replace(/[),.;]+$/, '');
      let host = '';
      try { host = new URL(url).hostname.toLowerCase(); } catch { /* malformed URL is rejected below */ }
      const offset = match.index ?? 0;
      const before = line.slice(Math.max(0, offset - 120), offset);
      const after = line.slice(offset + match[0].length, offset + match[0].length + 80);
      const requestContext = /(?:fetch\s*\(|XMLHttpRequest|<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|<img\b[^>]*\bsrc\s*=|@import|url\s*\()/i.test(before + ' ' + after);
      const officialHost = host === 'nasa.gov' || host.endsWith('.nasa.gov') || host === 'swpc.noaa.gov' || host.endsWith('.swpc.noaa.gov');
      const allowedLiteral = built && !requestContext && [
        'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink',
        'http://www.w3.org/XML/1998/namespace', 'http://www.w3.org/1998/Math/MathML',
        'https://react.dev/errors/',
      ].some((allowed) => url.startsWith(allowed));
      // Ignore a URL prefix assembled through template interpolation; it is not a request URL by itself.
      const interpolatedPrefix = built && url.includes('${');
      const schemaReference = built && /^https?:\/\/json-schema\.org\/draft(?:\/2020-12\/schema|-0[47]\/schema#)$/.test(url);
      const nasaLink = officialHost && !requestContext;
      const proxy = serverFunction && file.replaceAll('\\', '/').startsWith('netlify/functions/') && host === 'ccmc.gsfc.nasa.gov';
      if (!nasaLink && !proxy && !allowedLiteral && !interpolatedPrefix && !schemaReference) findings.push({ file, line: index + 1, message: `Disallowed external URL: ${url}` });
    }
  });
  return findings;
}

export function scanTracking(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const normalizedFile = file.replaceAll('\\', '/');
  const built = normalizedFile.startsWith('dist/') || normalizedFile.includes('/dist/');
  const pattern = built
    ? /google-analytics\.com|googletagmanager\.com|gtag\/js|mixpanel|segment\.io|cdn\.segment\.com|hotjar|sentry\.io|@sentry|posthog|plausible\.io|navigator\.sendBeacon|document\.cookie|fbq\s*\([^\n]{0,160}facebook|<iframe\b/g
    : /\bdocument\.cookie\b|\bnavigator\.sendBeacon\b|\bgtag\s*\(|\bga\s*\(|\bgoogletagmanager\b|\bgoogle-analytics\b|\bsegment\b|\bmixpanel\b|\bhotjar\b|\bplausible\b|\bposthog\b|\bsentry\b|\bfbq\s*\(|<iframe\b/g;
  content.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(pattern)) findings.push({ file, line: index + 1, message: `Tracking marker: ${match[0]}` });
  });
  return findings;
}

export function scanStorage(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(/(?:localStorage\.)?(?:setItem|getItem|removeItem)\s*\(\s*(['"`])([^'"`]+)\1/g)) {
      if (!match[2].startsWith('mbc.')) findings.push({ file, line: index + 1, message: `localStorage key must start with mbc.: ${match[2]}` });
    }
    for (const match of line.matchAll(/export\s+(?:const|let)\s+\w*_KEY\w*\s*=\s*(['"`])([^'"`]+)\1/g)) {
      if (!match[2].startsWith('mbc.')) findings.push({ file, line: index + 1, message: `Exported storage key must start with mbc.: ${match[2]}` });
    }
  });
  return findings;
}

export function scanCsp(toml: string): string[] {
  const issues: string[] = [];
  const block = toml.match(/\[\[headers\]\]\s*for\s*=\s*"\/\*"([\s\S]*?)(?=\n\[\[headers\]\]|$)/)?.[1] ?? '';
  const csp = block.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1] ?? '';
  for (const needed of ["connect-src 'self' https://api.nasa.gov", "script-src 'self'", "frame-ancestors 'none'"]) {
    if (!csp.includes(needed)) issues.push(`CSP missing ${needed}`);
  }
  if (/unsafe-(?:inline|eval)/i.test(csp)) issues.push('CSP contains unsafe-inline or unsafe-eval');
  if (!/Referrer-Policy\s*=\s*"no-referrer"/.test(block)) issues.push('Missing Referrer-Policy = "no-referrer"');
  return issues;
}

export function scanData(content: string): string[] {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return ['Invalid JSON']; }
  const issues: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((item, i) => visit(item, `${path}[${i}]`)); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (['sourceUrl', 'osdrUrl', 'marsTrekUrl', 'url'].includes(key) && typeof child === 'string') {
        try {
          const url = new URL(child);
          if (url.protocol !== 'https:' || !(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'))) issues.push(`${path}.${key} has a non-allowed URL`);
        } catch { issues.push(`${path}.${key} is not a valid URL`); }
      }
    }
    if ('retrievedAt' in record && (typeof record.retrievedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(record.retrievedAt) || Number.isNaN(Date.parse(record.retrievedAt)))) issues.push(`${path}.retrievedAt is not ISO UTC`);
    for (const [key, child] of Object.entries(record)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(parsed, '');
  if (!JSON.stringify(parsed).includes('"retrievedAt"')) issues.push('Snapshot has no retrievedAt');
  return issues;
}

const lineFindings = (files: string[], scanner: (file: string, text: string) => Finding[]): Finding[] => files.flatMap((file) => scanner(file, readFileSync(file, 'utf8')));
const root = process.cwd();
const sourceFiles = [...walk(join(root, 'src')), join(root, 'index.html'), ...walk(join(root, 'netlify', 'functions'))].filter((file) => /\.(tsx?|jsx?|html)$/.test(file));

describe('privacy scanners', () => {
  it('allows link-only official origins and rejects third parties or client requests', () => {
    expect(scanOrigins('src/a.ts', 'const link = "https://science.nasa.gov/x"')).toEqual([]);
    expect(scanOrigins('src/a.ts', 'const link = "https://www.swpc.noaa.gov/x"')).toEqual([]);
    expect(scanOrigins('src/a.ts', 'const link = "https://alerts.swpc.noaa.gov/x"')).toEqual([]);
    expect(scanOrigins('src/a.ts', 'fetch("https://science.nasa.gov/x")')[0]?.line).toBe(1);
    expect(scanOrigins('src/a.ts', 'const link = "https://evil.example/x"')[0]?.line).toBe(1);
  });
  it('allows known bundle string constants but rejects them in request contexts', () => {
    const literals = [
      'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink',
      'http://www.w3.org/XML/1998/namespace', 'http://www.w3.org/1998/Math/MathML',
      'https://react.dev/errors/418',
    ];
    for (const literal of literals) expect(scanOrigins('dist/assets/app.js', `const value="${literal}"`), literal).toEqual([]);
    expect(scanOrigins('dist/assets/app.js', 'fetch("http://www.w3.org/2000/svg")')).toHaveLength(1);
    expect(scanOrigins('dist/assets/app.js', '<script src="https://react.dev/errors/418"></script>')).toHaveLength(1);
  });
  it('detects tracking markers', () => {
    expect(scanTracking('x', 'const ok = true')).toEqual([]);
    expect(scanTracking('x', 'document.cookie')[0]?.message).toContain('document.cookie');
    expect(scanTracking('dist/assets/app.js', 'function ga(e){return e}')).toEqual([]);
    expect(scanTracking('dist/assets/app.js', 'const x="toStringTag"')).toEqual([]);
    expect(scanTracking('dist/assets/app.js', 'const x="https://www.googletagmanager.com/gtag/js"')[0]?.message).toContain('googletagmanager');
    expect(scanTracking('dist/assets/app.js', 'document.cookie = "x"')[0]?.message).toContain('document.cookie');
    expect(scanTracking('src/a.ts', 'gtag("config")')).toHaveLength(1);
    expect(scanTracking('src/a.ts', 'ga("send")')).toHaveLength(1);
  });
  it('enforces storage key prefix', () => {
    expect(scanStorage('x', 'localStorage.setItem("mbc.crew", name)')).toEqual([]);
    expect(scanStorage('x', 'localStorage.getItem("crew")')).toHaveLength(1);
  });
  it('checks CSP requirements', () => {
    expect(scanCsp('[ [headers] ]')).not.toEqual([]);
    expect(scanCsp('[[headers]]\nfor = "/*"\n[headers.values]\nContent-Security-Policy = "connect-src \'self\' https://api.nasa.gov; script-src \'self\'; frame-ancestors \'none\'"\nReferrer-Policy = "no-referrer"')).toEqual([]);
  });
  it('checks snapshot URLs and timestamps', () => {
    expect(scanData('{"retrievedAt":"2026-11-14T12:00:00Z","url":"https://science.nasa.gov/"}')).toEqual([]);
    expect(scanData('{"retrievedAt":"yesterday","url":"https://example.com"}')).toHaveLength(2);
  });
});

describe('shipped privacy guard', () => {
  it('checks all source files for external requests, trackers and CDN/font references', () => {
    const findings = [
      ...lineFindings(sourceFiles, (file, text) => scanOrigins(relative(root, file).replaceAll('\\', '/'), text, file.includes(`${join('netlify', 'functions')}`))),
      ...lineFindings(sourceFiles, scanTracking),
    ];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, index) => {
        if (/fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr/i.test(line)) findings.push({ file: relative(root, file), line: index + 1, message: 'Font or CDN reference' });
      });
      if (file.startsWith(join(root, 'src'))) findings.push(...scanStorage(relative(root, file), text));
    }
    expect(findings, findings.map((f) => `${f.file}:${f.line} ${f.message}`).join('\n')).toEqual([]);
  });
  it('checks CSP and all committed JSON snapshots', () => {
    expect(scanCsp(readFileSync(join(root, 'netlify.toml'), 'utf8'))).toEqual([]);
    const dataFiles = walk(join(root, 'public', 'data')).filter((file) => file.endsWith('.json'));
    for (const file of dataFiles) expect(scanData(readFileSync(file, 'utf8')), `${relative(root, file)}: ${scanData(readFileSync(file, 'utf8')).join(', ')}`).toEqual([]);
  });
  it('scans built JS, HTML and CSS when dist exists', () => {
    const dist = join(root, 'dist');
    const files = walk(dist).filter((file) => /\.(js|html|css)$/.test(file));
    if (files.length === 0) { console.info('Privacy guard: dist/ missing; built-output scan skipped (source scan ran).'); return; }
    const findings = [...lineFindings(files, (file, text) => scanOrigins(relative(root, file).replaceAll('\\', '/'), text)), ...lineFindings(files, scanTracking)];
    for (const file of files) readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (/fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr/i.test(line)) findings.push({ file: relative(root, file), line: index + 1, message: 'Font or CDN reference' });
    });
    expect(findings, findings.map((f) => `${f.file}:${f.line} ${f.message}`).join('\n')).toEqual([]);
  });
});

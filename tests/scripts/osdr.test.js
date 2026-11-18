// B5 OSDR facts: mocked tests only (no network). (D-020).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStudyPage, fetchOsdrSnapshot } from '../../scripts/fetch-osdr.js';
import {
  FACT_DRAFTS,
  PAGE_SIZE,
  parseSearchPage,
  searchUrl,
  selectFacts,
  studyUrl,
  TOPICS,
  wordCount,
} from '../../scripts/lib/osdr.js';
import { OsdrSnapshotSchema } from '../../src/shared/schemas.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A study whose description contains the draft's evidence sentence verbatim. */
const studyFor = (id, extra = '') => {
  const draft = FACT_DRAFTS.find((d) => d.id === id);
  return {
    id,
    title: `Study ${id} about ${draft.topic} in spaceflight`,
    description: `Intro. ${draft.evidence} ${extra}`,
  };
};
const allStudies = () => FACT_DRAFTS.map((d) => studyFor(d.id));
const hit = (s) => ({ _source: { Accession: s.id, 'Study Title': s.title, 'Study Description': s.description } });

describe('OSDR helpers', () => {
  it('builds offset-based search URLs (from = page x size)', () => {
    expect(new URL(searchUrl('radiation', 0)).searchParams.get('from')).toBe('0');
    expect(new URL(searchUrl('radiation', 2)).searchParams.get('from')).toBe(String(2 * PAGE_SIZE));
    expect(new URL(searchUrl('bone')).searchParams.get('type')).toBe('cgene');
  });

  it('builds study URLs and rejects bad accessions', () => {
    expect(studyUrl('OSD-396')).toBe('https://osdr.nasa.gov/bio/repo/data/studies/OSD-396');
    expect(() => studyUrl('OSD-0')).toThrow();
    expect(() => studyUrl('GLDS-1')).toThrow();
  });

  it('parses a search page and rejects malformed or timed-out responses', () => {
    const s = studyFor('OSD-21');
    expect(parseSearchPage({ hits: { total: 1, hits: [hit(s)] } })).toEqual({ total: 1, studies: [s] });
    expect(() => parseSearchPage({ timed_out: true, hits: { total: 0, hits: [] } })).toThrow('timed out');
    expect(() => parseSearchPage({ hits: { total: 'x', hits: [] } })).toThrow('Malformed');
    expect(() => parseSearchPage({ hits: { total: 1, hits: [{ _source: { Accession: 'OSD-1' } }] } })).toThrow(
      'Malformed',
    );
  });

  it('every sentence in drafts and archived facts is under 15 words', () => {
    const snapshot = JSON.parse(readFileSync('public/data/osdr-facts.json', 'utf8'));
    const texts = [...FACT_DRAFTS.map((draft) => draft.text), ...snapshot.items.map((item) => item.text)];
    for (const text of texts) {
      const sentences = text
        .split(/[.!?]/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      for (const sentence of sentences) expect(wordCount(sentence)).toBeLessThan(15);
    }
  });
  it('every editorial draft is 25 words or fewer and has evidence', () => {
    for (const d of FACT_DRAFTS) {
      expect(wordCount(d.text)).toBeLessThanOrEqual(25);
      expect(d.evidence.trim().length).toBeGreaterThan(20);
    }
  });
});

describe('selectFacts', () => {
  it('picks two studies per topic, sorted by accession number, and passes the schema', () => {
    const items = selectFacts(allStudies());
    expect(items).toHaveLength(6);
    for (const t of TOPICS) expect(items.filter((i) => i.topic === t)).toHaveLength(2);
    const nums = items.map((i) => Number(i.id.slice(4)));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    OsdrSnapshotSchema.parse({
      retrievedAt: '2026-11-14T00:00:00Z',
      source: 'x',
      sourceUrl: 'https://osdr.nasa.gov/bio/',
      items,
    });
  });

  it('is deterministic regardless of input order and duplicates', () => {
    const a = selectFacts(allStudies());
    const b = selectFacts([...allStudies()].reverse().concat(allStudies()));
    expect(b).toEqual(a);
  });

  it('fails closed when a study description no longer contains the evidence', () => {
    const studies = allStudies().map((s) => (s.id === 'OSD-396' ? { ...s, description: 'Changed text.' } : s));
    expect(() => selectFacts(studies)).toThrow('Evidence changed for OSD-396');
  });

  it('fails when a topic has fewer than two reviewed studies', () => {
    expect(() => selectFacts(allStudies().filter((s) => s.id !== 'OSD-360'))).toThrow(
      'Need two evidence-reviewed radiation',
    );
  });

  it('rejects conflicting metadata for the same accession', () => {
    const s = studyFor('OSD-21');
    expect(() => selectFacts([s, { ...s, title: 'Other title' }])).toThrow('Conflicting');
  });
});

describe('fetchOsdrSnapshot (mocked network)', () => {
  it('pages through every result by offset, checks study pages, and returns a valid snapshot', async () => {
    const studies = allStudies();
    // Radiation gets 2 pages (PAGE_SIZE + 1 hits) to prove offset paging.
    const filler = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: `OSD-${9000 + i}`,
        title: 'Unrelated',
        description: 'Unrelated study.',
      }));
    const byTopic = {
      bone: studies.filter((s) => FACT_DRAFTS.find((d) => d.id === s.id).topic === 'bone'),
      muscle: studies.filter((s) => FACT_DRAFTS.find((d) => d.id === s.id).topic === 'muscle'),
      radiation: [
        ...filler(PAGE_SIZE - 1),
        ...studies.filter((s) => FACT_DRAFTS.find((d) => d.id === s.id).topic === 'radiation'),
      ],
    };
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input) => {
        const url = new URL(String(input));
        calls.push(url.href);
        if (url.pathname.startsWith('/bio/repo/data/studies/'))
          return Promise.resolve(new Response('<html></html>', { status: 200 }));
        const term = url.searchParams.get('term');
        const from = Number(url.searchParams.get('from'));
        const all = byTopic[term];
        return Promise.resolve(
          Response.json({ hits: { total: all.length, hits: all.slice(from, from + PAGE_SIZE).map(hit) } }),
        );
      }),
    );
    const snap = await fetchOsdrSnapshot();
    OsdrSnapshotSchema.parse(snap);
    expect(snap.items).toHaveLength(6);
    const radiationOffsets = calls
      .filter((c) => c.includes('term=radiation'))
      .map((c) => new URL(c).searchParams.get('from'));
    expect(radiationOffsets).toEqual(['0', String(PAGE_SIZE)]);
    expect(calls.filter((c) => c.includes('/bio/repo/data/studies/'))).toHaveLength(6);
    expect(snap.notes).toContain('Archived (retrieved');
  });

  it('checkStudyPage throws on a non-200 study page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })));
    await expect(checkStudyPage('https://osdr.nasa.gov/bio/repo/data/studies/OSD-1')).rejects.toThrow('HTTP 404');
  });
});

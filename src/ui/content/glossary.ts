export type GlossaryKey = 'dose' | 'solarFlare' | 'cme' | 'shielding' | 'sol' | 'commDelay' | 'jezero';

export interface GlossaryEntry {
  term: string;
  definition: string;
  sourceTitle: string;
  sourceUrl: string;
}

/** Kid-friendly definitions: at most 20 words, every sentence under 15 words. */
export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  dose: {
    term: 'Dose',
    definition: 'Dose is how much radiation energy a body soaks up.',
    sourceTitle: 'NASA: Why space radiation matters',
    sourceUrl: 'https://www.nasa.gov/missions/analog-field-testing/why-space-radiation-matters/',
  },
  solarFlare: {
    term: 'Solar flare',
    definition: 'A solar flare is a sudden flash of energy and light from the Sun.',
    sourceTitle: 'NOAA SWPC: Solar flares and radio blackouts',
    sourceUrl: 'https://www.swpc.noaa.gov/phenomena/solar-flares-radio-blackouts',
  },
  cme: {
    term: 'CME',
    definition: 'Coronal mass ejection: a huge cloud of solar gas and magnetism blasted into space.',
    sourceTitle: 'NOAA SWPC: Coronal mass ejections',
    sourceUrl: 'https://www.swpc.noaa.gov/phenomena/coronal-mass-ejections',
  },
  shielding: {
    term: 'Shielding',
    definition: 'Shielding is material, like water, plastic or Moon soil, that blocks some radiation.',
    sourceTitle: 'NASA: Why space radiation matters',
    sourceUrl: 'https://www.nasa.gov/missions/analog-field-testing/why-space-radiation-matters/',
  },
  sol: {
    term: 'Sol',
    definition: 'A sol is one day on Mars. It is a little longer than an Earth day.',
    sourceTitle: 'NASA: Barsoom, definition and length of a Martian sol',
    sourceUrl: 'https://www.nasa.gov/image-article/barsoom/',
  },
  commDelay: {
    term: 'Communication delay',
    definition: 'Radio messages between Earth and Mars take about 4 to 24 minutes one way.',
    sourceTitle: 'NASA NTRS: Why Moon to Mars (2025 IAC), one-way light-time',
    sourceUrl: 'https://ntrs.nasa.gov/api/citations/20250009282/downloads/2025%20IAC%20-%20Why%20Moon%20and%20Mars%20-%200916%20Edits.pdf',
  },
  jezero: {
    term: 'Jezero Crater',
    definition: 'Jezero is a Mars crater that once held a lake. Perseverance landed there in 2021.',
    sourceTitle: 'NASA: Perseverance landing site, ancient Jezero lake',
    sourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
  },
};

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

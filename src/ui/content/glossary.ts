export type GlossaryKey = 'dose' | 'solarFlare' | 'cme' | 'shielding' | 'sol';

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
    definition: 'Sol is a space word for a day on Mars.',
    sourceTitle: 'NASA Mars',
    sourceUrl: 'https://mars.nasa.gov/',
  },
};

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

export const TOPICS = ['bone', 'muscle', 'radiation'];
export const PAGE_SIZE = 100;

// Editorial candidates, reviewed against NASA's Search API descriptions. Refreshes
// must still find the exact evidence; changed metadata requires another review.
export const FACT_DRAFTS = [
  {
    id: 'OSD-342',
    topic: 'bone',
    text: 'Some mice went to the International Space Station. Scientists tested ways to protect their muscles and bones.',
    evidence:
      'Here, we used both genetic and pharmacological approaches to investigate the effect of targeting MSTN/activin A signaling in mice that were sent to the International Space Station.',
  },
  {
    id: 'OSD-396',
    topic: 'bone',
    text: 'Scientists studied how spaceflight affects the healing of broken bones.',
    evidence:
      'Here we examined the effects of spaceflight on bone fracture healing using a 2 mm femoral segmental bone defect (SBD) model.',
  },
  {
    id: 'OSD-21',
    topic: 'muscle',
    text: 'Some mice flew on a space shuttle. Scientists compared their muscle gene activity with mice on Earth.',
    evidence:
      'To identify changes in gene expression that may underlie these adaptations, microarray expression analysis was performed on gastrocnemius from mice flown on the STS-108 shuttle flight (11 days, 19 hours) versus mice maintained on earth for the same period.',
  },
  {
    id: 'OSD-326',
    topic: 'muscle',
    text: 'Some mice lived in space, and some stayed on Earth. Scientists compared genes and chemicals in their thigh muscles.',
    evidence:
      'Under the Rodent Research Program of NASA, we assayed the genomic and metabolomics perturbations in the quadriceps of C57BL/6J male mice that lived on the spaceflight (FLT) or at Ground Control (CTR) for approximately four weeks.',
  },
  {
    id: 'OSD-360',
    topic: 'radiation',
    text: 'Scientists studied how radiation exposure affected chemical processes in the spleens of mice.',
    evidence:
      'In this study we investigated the effects in overall metabolism of three different low dose radiation exposures (γ-rays, 16O, and 56Fe) in spleen from male C57BL/6 mice at 1, 2, and 4 months after exposure.',
  },
  {
    id: 'OSD-366',
    topic: 'radiation',
    text: 'Scientists tested skin cells from 15 kinds of mice with simulated deep space radiation.',
    evidence:
      'This study analyzes the variability of responses to simulated deep space radiation among 15 commonly used mouse strains.',
  },
];

export function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function record(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected OSDR object');
  return value;
}

/** Documented Search API: https://api.nasa.gov/#osdr (cgene only). */
export function parseSearchPage(raw) {
  const root = record(raw);
  if (root.timed_out === true) throw new Error('OSDR search timed out');
  const hits = record(root.hits);
  const total = hits.total;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(hits.hits)) {
    throw new Error('Malformed OSDR search hits');
  }
  const studies = hits.hits.map((hit) => {
    const source = record(record(hit)._source);
    const id = source.Accession;
    const title = source['Study Title'];
    const description = source['Study Description'];
    if (
      typeof id !== 'string' ||
      !/^OSD-[1-9]\d*$/.test(id) ||
      typeof title !== 'string' ||
      !title.trim() ||
      typeof description !== 'string' ||
      !description.trim()
    )
      throw new Error('Malformed OSDR study');
    return { id, title, description };
  });
  return { total, studies };
}

export function studyUrl(id) {
  if (!/^OSD-[1-9]\d*$/.test(id)) throw new Error('Invalid OSDR accession');
  return `https://osdr.nasa.gov/bio/repo/data/studies/${id}`;
}

export function searchUrl(topic, page = 0) {
  const url = new URL('https://osdr.nasa.gov/osdr/data/search');
  // Elasticsearch-style paging: `from` is a result offset, not a page index (D-020).
  url.search = new URLSearchParams({
    term: topic,
    type: 'cgene',
    from: String(page * PAGE_SIZE),
    size: String(PAGE_SIZE),
  }).toString();
  return url.href;
}

const accessionNumber = (id) => Number(id.slice(4));

/** Two evidence-reviewed studies per topic, independent of upstream hit order. */
export function selectFacts(studies, drafts = FACT_DRAFTS) {
  const unique = new Map();
  for (const study of studies) {
    const previous = unique.get(study.id);
    if (previous && (previous.title !== study.title || previous.description !== study.description)) {
      throw new Error(`Conflicting OSDR metadata for ${study.id}`);
    }
    unique.set(study.id, study);
  }
  if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length) throw new Error('Duplicate draft accession');
  const candidates = drafts.flatMap((draft) => {
    const study = unique.get(draft.id);
    if (!study) return [];
    if (!draft.evidence.trim() || !study.description.includes(draft.evidence))
      throw new Error(`Evidence changed for ${draft.id}`);
    if (!wordCount(draft.text) || wordCount(draft.text) > 25) throw new Error(`Draft word limit for ${draft.id}`);
    // Prefer clear topic titles and explicit flight context, using only API text.
    const score =
      Number(
        /spaceflight|space flight|international space station|\bISS\b|rodent research/i.test(
          `${study.title} ${study.description}`,
        ),
      ) *
        2 +
      Number(study.title.toLowerCase().includes(draft.topic));
    return [{ draft, study, score }];
  });
  const selected = TOPICS.flatMap((topic) => {
    const ranked = candidates
      .filter((candidate) => candidate.draft.topic === topic)
      .sort((a, b) => b.score - a.score || accessionNumber(a.study.id) - accessionNumber(b.study.id));
    if (ranked.length < 2) throw new Error(`Need two evidence-reviewed ${topic} studies`);
    return ranked.slice(0, 2).map(({ study, draft }) => ({
      id: study.id,
      text: draft.text,
      studyTitle: study.title,
      osdrUrl: studyUrl(study.id),
      topic,
    }));
  });
  return selected.sort((a, b) => accessionNumber(a.id) - accessionNumber(b.id));
}

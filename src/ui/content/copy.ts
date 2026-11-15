/**
 * Every new or changed player-facing sentence from the usability sprint (D-038), in one place for review.
 * Rules: every sentence under 15 words (NFR-06). Kid words on screen; numbers like flare class go behind "More details".
 * Real facts keep their source links; game rules say "In this game".
 * Day/sol wording: pass the site's day word ('day' | 'sol') to the functions below.
 */
import type { SiteId } from '../../shared/types';

export type DayWord = 'day' | 'sol';
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Names used for each system and meter, everywhere in the UI (engine names stay life/lifeSupport/power). */
export const NAMES = {
  air: 'Air & food',
  shield: 'Shields',
  science: 'Science',
  battery: 'Battery',
  crew: 'Crew health',
  scienceScore: 'Science',
} as const;

/** One-line rules shown with each system or meter. */
export const RULE_LINES = {
  battery: 'Shields and science use battery. Air & food uses none. It recharges a little each day.',
  air: 'Air, water and food. Give it at least 4 power a day.',
  shield: 'Blocks radiation from solar storms.',
  science: 'Earns science points. Points help you win.',
  crew: 'Radiation from storms hurts the crew.',
} as const;

// ---------- Header (P1) ----------
export const HEADER = {
  howToPlay: 'How to play',
  dataUsed: 'Data used',
  /** "Goal: survive 10 days · Crew safe · Science ★ 35" */
  goal: (days: number, dayWord: DayWord, science: number | null) =>
    science === null
      ? `Goal: survive ${days} ${dayWord}s · Crew safe · Earn science ★`
      : `Goal: survive ${days} ${dayWord}s · Crew safe · Science ★ ${science}`,
  dayOf: (dayWord: DayWord, day: number, days: number) => `${cap(dayWord)} ${day} of ${days}`,
} as const;

// ---------- How to play intro (P1) ----------
export interface IntroCard {
  title: string;
  lines: string[];
}
export const INTRO = {
  heading: 'How to play',
  skip: 'Skip',
  next: 'Next',
  back: 'Back',
  done: (_dayWord: DayWord) => 'Got it!',
  close: 'Close',
  step: (n: number, total: number) => `Card ${n} of ${total}`,
  cards: (site: SiteId): IntroCard[] => [
    {
      title: '① Your goal',
      lines: [
        site === 'mars'
          ? 'Keep the crew safe for 10 sols and earn science points.'
          : 'Keep the crew safe for 10 days and earn science points.',
        'If Crew health or Air & food reach 0, the mission ends.',
      ],
    },
    {
      title: '② Share your power',
      lines: [
        `Every ${site === 'mars' ? 'sol' : 'day'} you get 10 power.`,
        'Share it between Air & food, Shields and Science.',
        RULE_LINES.battery,
      ],
    },
    {
      title: '③ Watch for solar storms',
      lines: [
        'Real solar storms from NASA records can hit your base.',
        'Each game day uses a real date from NASA records.',
        "Shields protect your crew, but power spent on shields can't do science.",
        site === 'mars'
          ? 'In this game, storm news from Earth arrives one sol late. A sol is one Mars day.'
          : 'On the Moon, you see each storm before you plan.',
      ],
    },
  ],
} as const;

// ---------- Start screen (P7, P5) ----------
export const START = {
  title: 'Moon Base Cadets',
  tagline: 'Run a Moon base. Survive real solar storms.',
  goal: 'Your goal: keep your crew safe for 10 days and earn science points.',
  chooseBase: 'Choose your base',
  siteEasy: 'Easier: in this game, you get a warning before each storm.',
  siteHard: 'Harder: in this game, storm warnings from Earth arrive one day late.',
  siteBadgeEasy: 'Easier',
  siteBadgeHard: 'Harder',
  crewLabel: 'Crew name (optional)',
  crewHint: 'Stays on this device only.',
  start: 'Start mission',
  newMission: 'New mission',
  continue: (site: SiteId, dayWord: DayWord, day: number) =>
    `${site === 'mars' ? 'Continue Mars mission' : 'Continue mission'} (${cap(dayWord)} ${day})`,
  crewWaiting: (name: string) => `Crew ${name} is waiting at the base.`,
} as const;

// ---------- Day screen (P2, P3) ----------
export const DAY = {
  step1: "1. Check today's space weather",
  step1Mars: '1. Check the message from Earth',
  step2: '2. Share your 10 power',
  step3: (dayWord: DayWord) => `3. Start the ${dayWord}`,
  powerLeft: 'Power left to share:',
  startButton: (dayWord: DayWord, day: number) => `Start ${dayWord} ${day}`,
  startHint: 'Share all 10 power to start the day.',
  startHintMars: 'Share all 10 power to start the sol.',
  /** Shown under the allocator when Air & food has fewer than 4 power. */
  airWarning: 'Air & food needs at least 4 power, or air drops.',
  /** Shown when the battery will be empty after this plan. */
  batteryWarning: 'This plan empties the battery. Give Air & food more power.',
  presetsLabel: 'Quick plans (optional):',
  presets: {
    balanced: 'Balanced',
    storm: 'Storm-ready',
    science: 'Science day',
  },
  reset: 'Clear',
  previewLabel: (dayWord: DayWord) => `If you start this ${dayWord}:`,
  previewLabelMars: 'If the Sun stays calm:',
  previewMarsWarn: 'A storm could make it worse.',
  fromYesterday: (dayWord: DayWord) => (dayWord === 'sol' ? 'From last sol' : 'From yesterday'),
  crewLine: (crew: string, site: SiteId) =>
    `Crew ${crew} · ${site === 'mars' ? 'Mars base, Jezero Crater' : 'Moon base, south pole'}`,
} as const;

/** Preset plans (UI only; the engine still receives an allocation that sums to 10). */
export const PRESETS = {
  balanced: { life: 4, shield: 3, science: 3 },
  storm: { life: 4, shield: 6, science: 0 },
  science: { life: 4, shield: 0, science: 6 },
} as const;

// ---------- Event card (P5) ----------
export const EVENT = {
  title: (dayWord: DayWord, day: number) => `${cap(dayWord)} ${day} space weather`,
  badgeStorm: 'Real storm from NASA',
  badgeCalm: (dayWord: DayWord) => `Calm ${dayWord} (real NASA date)`,
  badgePlaceholder: 'Placeholder',
  stormSize: 'Storm size:',
  sizes: { 0: 'None', 1: 'Small', 2: 'Medium', 3: 'Big' } as Record<0 | 1 | 2 | 3, string>,
  /** Kind words. "Storm cloud" links to the CME glossary entry. */
  kind: { FLR: 'Solar flare', CME: 'Solar storm cloud', QUIET: 'Calm Sun' } as const,
  realDate: 'Real date:',
  moreDetails: 'More details',
  fewerDetails: 'Fewer details',
  flareClass: (cls: string) => `NASA flare class: ${cls}. X is the biggest class.`,
  cmeSpeed: (kms: string) => `Speed: ${kms} km per second.`,
  nasaLink: 'See the NASA record',
  marsListed: "NASA's model predicted this storm would reach Mars.",
  marsGameOnly: 'Recorded by NASA. In the game, this storm also reaches Mars.',
} as const;

// ---------- Mars message from Earth (P5) ----------
export const EARTH_MSG = {
  title: 'Message from Earth',
  status: "Today's storm news comes after you start the sol.",
  realFact: 'Real fact',
  gameRule: 'Game rule',
  radio: (min: number, max: number) => `Radio takes ${min} to ${max} minutes between Earth and Mars. That is one way.`,
  radioNoNumbers: 'Radio takes minutes between Earth and Mars.',
  rule: 'In this game, storm news reaches you one sol late.',
  plan: "Plan without knowing today's weather.",
  yesterday: 'Last sol was:',
} as const;

// ---------- Report (P6) ----------
export type VerdictTone = 'good' | 'ok' | 'bad';
export type VerdictKind =
  | 'lostCrew'
  | 'lostAir'
  | 'hurt'
  | 'airLow'
  | 'batteryEmpty'
  | 'batteryLow'
  | 'bigStorm'
  | 'blocked'
  | 'mostlyBlocked'
  | 'shieldsWasted'
  | 'calmScience'
  | 'calmNoScience';

export const VERDICT_TEXT: Record<VerdictKind, (dayWord: DayWord) => string> = {
  lostCrew: () => 'Oh no! The storm hurt your crew too much.',
  lostAir: () => 'Oh no! Air & food ran out.',
  hurt: () => 'Ouch, low shields. Your crew got hurt by the storm.',
  airLow: () => 'Air was low. Give Air & food at least 4 power.',
  batteryEmpty: () => 'The battery ran out, so shields were weak. Give Air & food more power.',
  batteryLow: () => 'Battery is low! Put more power into Air & food so it can recharge.',
  bigStorm: () => 'A big storm! Your shields blocked most of it.',
  blocked: () => 'Great call! Your shields stopped the storm.',
  mostlyBlocked: () => 'Good call! Your shields blocked most of the storm.',
  shieldsWasted: (w) =>
    w === 'sol'
      ? "No storm this sol. Shields weren't needed, but you couldn't know."
      : "Shields weren't needed today. That power could have earned science.",
  calmScience: (w) => `Smart! A calm ${w}, so your power went to science.`,
  calmNoScience: (w) => `A calm ${w}. Science power would have earned points.`,
};

export const VERDICT_TONE: Record<VerdictKind, VerdictTone> = {
  lostCrew: 'bad',
  lostAir: 'bad',
  hurt: 'bad',
  airLow: 'bad',
  batteryEmpty: 'bad',
  batteryLow: 'bad',
  bigStorm: 'ok',
  blocked: 'good',
  mostlyBlocked: 'good',
  shieldsWasted: 'ok',
  calmScience: 'good',
  calmNoScience: 'ok',
};

export const REPORT = {
  heading: (dayWord: DayWord, day: number) => `${cap(dayWord)} ${day} report`,
  marsArrived: 'Message from Earth arrived:',
  marsLate: 'In this game, the warning came too late. Far from Earth, crews plan ahead!',
  next: (dayWord: DayWord) => `Next ${dayWord}`,
  final: 'See how the mission went',
  verdictLabel: 'How did it go?',
} as const;

/** One short line per meter on the report. Inputs are plain numbers from the TurnResult. */
export const REPORT_LINES = {
  batteryEmpty: 'The battery ran out. Air & food will drop.',
  batteryDown: 'Shields and science used more than the Sun added.',
  batteryUp: 'The Sun added more than you used.',
  batterySame: 'You used what the Sun added.',
  airShort: (units: number, next: string) =>
    `Only ${units} power for air. Air drops ${next}.`,
  airShortDown: (units: number, next: string) =>
    `Air dropped. Only ${units} power for air, so it drops again ${next}.`,
  airDown: 'Air dropped because of an earlier shortage.',
  airUp: 'Extra power topped up the air.',
  airSame: 'Enough power kept the air steady.',
  crewHurt: (blocked: number, received: number) =>
    blocked > 0 ? `Shields blocked ${blocked}. ${received} got through.` : `No shields. ${received} radiation got through.`,
  crewSafe: 'Shields kept the crew safe.',
  crewCalm: 'Calm Sun. No radiation hit the crew.',
  science: (points: number) => `+${points} science points.`,
  noScience: 'No power for science, so no points.',
  gameNumbers: 'Game numbers',
} as const;

// ---------- Live banner (ux-audit S4: sounded like an error) ----------
export const LIVE = {
  archived: (date: string) => `You're playing with archived NASA records (retrieved ${date}).`,
  placeholder: 'Dev mode uses placeholder events, not real data.',
} as const;

// ---------- End screen (P8) ----------
export const END = {
  wonTitle: 'You made it!',
  lostTitle: 'Mission over.',
  lostTitleOn: (dayWord: DayWord, day: number) => `Mission over on ${dayWord} ${day}.`,
  lostRescue: 'Mission Control flew the crew home safely.',
  wonWhy: (crew: string, days: number, dayWord: DayWord) =>
    `Crew ${crew} stayed safe for all ${days} ${dayWord}s.`,
  lostWhyCrew: 'Crew health reached 0. Storm radiation hurt the crew too much.',
  lostWhyAir: 'Air & food reached 0. It needs at least 4 power every day.',
  scoreLabel: 'Science score',
  learnedTitle: 'What you learned',
  learnStorm: 'More shields on big storm days protect your crew.',
  learnCalm: 'Calm days are great for science.',
  learnMars: 'On Mars, storm news comes late. Keep some shields up every sol.',
  learnBattery: 'Watch the battery. Shields and science drain it; Air & food does not.',
  learnGood: 'You balanced safety and science. Great work!',
  learnAir: 'Air & food needs at least 4 power every day.',
  timelineTitle: 'What really happened',
  plan: (life: number, shield: number, science: number) =>
    `Air & food ${life} · Shields ${shield} · Science ${science}`,
  nasaLink: 'See the NASA record',
  factLabel: "From NASA's Open Science Data Repository",
  factTitle: 'Real NASA science',
  factLink: 'Read about this study',
  playAgain: 'Play again',
  playAgainNote: "You'll get a new set of real space weather.",
} as const;

// ---------- Additions by area (each area appends ONLY under its own marker; keep sentences under 15 words) ----------
// ---- additions: intro-header ----
// ---- additions: day-allocator ----
// ---- additions: meters-copy ----
export const METERS_COPY = {
  low: 'Low!',
  danger: 'Danger!',
  baseStatus: 'Base status',
  up: 'up',
  down: 'down',
  noChange: 'no change',
} as const;
export const EARTH_EXTRA = {
  /** Connects the real radio time to the game's one-sol delay. */
  radioFaster: 'Real radio is faster. The delay is a game rule to practise planning.',
  source: 'Source',
} as const;
export const EVENT_EXTRA = {
  placeholderDate: 'Placeholder date:',
  newTab: '(opens in a new tab)',
} as const;
// ---- additions: report ----
export const REPORT_MORE = {
  toneWord: { good: 'Good', ok: 'Okay', bad: 'Problem' } as Record<VerdictTone, string>,
  arrowUp: 'Up',
  arrowDown: 'Down',
  arrowSame: 'No change',
  /** Words for "when does air drop": the next turn, or now when the mission just ended. */
  airWhen: (dayWord: DayWord, isFinal: boolean) =>
    isFinal ? (dayWord === 'sol' ? 'this sol' : 'today') : dayWord === 'sol' ? 'next sol' : 'tomorrow',
  fromTo: (before: number, after: number) => `from ${before} to ${after}`,
  meterListLabel: 'What changed',
  /** Button that says which day comes next, e.g. "Go to sol 3". */
  goTo: (dayWord: DayWord, n: number) => `Go to ${dayWord} ${n}`,
  /** Shorter Mars line (replaces REPORT.marsLate on the report). */
  marsLateShort: 'In this game, the warning came too late.',
} as const;
// ---- additions: start-end ----
export const START_END = {
  comingSoon: 'Coming soon',
  loadingMars: 'Loading Mars data…',
  selected: 'Selected',
  /** Visually-hidden prefix for the Easier/Harder badge. */
  badgeLabel: 'Difficulty:',
  healthNone: 'Crew health: no change',
  healthUp: (n: number) => `Crew health went up by ${n}`,
  healthDown: (n: number) => `Crew health went down by ${n}`,
  placeholder: '(placeholder)',
  studyLabel: 'Study title:',
  opensNewTab: ' (opens in a new tab)',
  timelineAria: (dayWordCapped: string, dayWord: string) => `${dayWordCapped} by ${dayWord}`,
  scoreAria: (n: number) => `${n} science points`,
} as const;

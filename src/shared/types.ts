/**
 * Outpost Junior: shared contracts.
 *
 *
 * Need a change? Ask under OPEN ISSUES in your result file.
 *
 * Every type here must be JSON-serialisable (no functions, Dates, Maps or classes),
 * because GameState is saved to localStorage and snapshots are plain JSON files.
 */

/** Game rule: power units the player splits each mission day. */
export const POWER_UNITS_PER_DAY = 10;
/** Game rule: length of one mission. */
export const MISSION_DAYS = 10;
/** Every meter is clamped to this range. */
export const METER_MIN = 0;
export const METER_MAX = 100;

/** Systems the player powers. Integers 0..10 that sum to exactly POWER_UNITS_PER_DAY. */
export interface Allocation {
  life: number;
  shield: number;
  science: number;
}
export type SystemKey = keyof Allocation;

/** Base meters, each an integer in 0..100. */
export interface Meters {
  /** Power reserve (battery). */
  power: number;
  lifeSupport: number;
  crewHealth: number;
}
export type MeterKey = keyof Meters;

export type GameStatus = 'playing' | 'won' | 'ended';

export type SolarEventKind = 'FLR' | 'CME' | 'QUIET';
/** 0 = quiet day, 1 = minor, 2 = moderate, 3 = strong. */
export type Severity = 0 | 1 | 2 | 3;

/** One real DONKI event (or one real quiet day) as it appears on a mission day. */
export interface SolarEvent {
  /** DONKI flrID / activityID for FLR and CME events. "QUIET-YYYY-MM-DD" for quiet days. */
  id: string;
  source: 'DONKI';
  kind: SolarEventKind;
  /** UTC calendar date of the real event, ISO "YYYY-MM-DD". */
  realDate: string;
  /** Raw DONKI time stamp (e.g. "2024-05-10T06:27Z"), if there is one. Not set for QUIET days. */
  realTime?: string;
  severity: Severity;
  /** FLR only, e.g. "X1.1". */
  flareClass?: string;
  /** CME only: speed from the most accurate DONKI analysis, in km/s. */
  cmeSpeedKms?: number;
  /** Player-facing sentence. The snapshot holds a neutral draft; the UI copy layer (lead agent, F7) may override it. */
  kidText: string;
  /** Link back to the DONKI record (or to a DONKI search for that date, for QUIET days). */
  sourceUrl: string;
}

/** Radiation numbers for one turn, in game units (game rules, not real dose). */
export interface DoseBreakdown {
  incoming: number;
  blocked: number;
  received: number;
}

/** Plain-language explanation for each readout, at most 15 words each. */
export interface TurnExplanations {
  power: string;
  lifeSupport: string;
  crewHealth: string;
  science: string;
}

/** What happened (or would happen) on one mission day. */
export interface TurnResult {
  /** Mission day this result is for (1..MISSION_DAYS). */
  day: number;
  allocation: Allocation;
  event: SolarEvent;
  before: Meters;
  after: Meters;
  /** after minus before, per meter. */
  deltas: Meters;
  scienceBefore: number;
  scienceGained: number;
  scienceAfter: number;
  dose: DoseBreakdown;
  explanations: TurnExplanations;
  /** Game status after this turn. */
  statusAfter: GameStatus;
}

/**
 * A consequence that lands on a later day (e.g. low life support today drains it tomorrow).
 * The engine owns how these are created; the UI only lists them.
 */
export interface CarryOverEffect {
  id: string;
  /** Mission day on which the effect is applied. */
  dueDay: number;
  meter: MeterKey;
  /** Signed change applied to the meter on dueDay. */
  delta: number;
  /** Plain-language reason, at most 15 words. */
  reason: string;
}

export interface GameState {
  /** Current mission day, 1..MISSION_DAYS. When status is not 'playing' it is the last day played. */
  day: number;
  meters: Meters;
  scienceScore: number;
  /** One entry per resolved day, in order. */
  history: TurnResult[];
  seed: number;
  /** Identifies the drawn event set (see eventSetIdOf in ./eventSet.ts). */
  eventSetId: string;
  /** The drawn set: events[i] hits on day i + 1. Length MISSION_DAYS. */
  events: SolarEvent[];
  /** Pending consequences for later days. */
  carryOver: CarryOverEffect[];
  status: GameStatus;
}

/** A committed data file in public/data/. */
export interface Snapshot<T> {
  /** ISO 8601 date-time of the fetch, UTC. Shown as "Archived (retrieved YYYY-MM-DD)". */
  retrievedAt: string;
  /** Human name of the source, e.g. "NASA DONKI (CCMC)". */
  source: string;
  /** Landing page or API base for the source. */
  sourceUrl: string;
  /** Optional query window. */
  window?: { startDate: string; endDate: string };
  /** Optional honest notes about how the items were picked. */
  notes?: string;
  items: T[];
}

export type ScienceTopic = 'bone' | 'muscle' | 'radiation';

/** One real NASA OSDR study, summarised for kids. */
export interface ScienceFact {
  id: string;
  /** At most 25 words. */
  text: string;
  studyTitle: string;
  osdrUrl: string;
  topic?: ScienceTopic;
}

/** ISS dose-rate calibration from RadLab. The Moon number is never invented. */
export interface DoseCalibration {
  issDoseRateMicroGyPerDay: number;
  retrievedAt: string;
  /** Explains that the ISS is inside Earth's magnetic field and the Moon surface is not. */
  note: string;
  source: string;
  sourceUrl: string;
}

/** Response body of GET /.netlify/functions/space-weather (always HTTP 200). */
export type LiveSpaceWeather =
  | { live: true; fetchedAt: string; events: SolarEvent[] }
  | { live: false };

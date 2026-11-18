/**
 * Moon Base Cadets: shared contracts.
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

/** Base meters, each an integer in 0..100. */

/** Where the mission happens (D-023). */

/** 0 = quiet day, 1 = minor, 2 = moderate, 3 = strong. */

/** One real DONKI event (or one real quiet day) as it appears on a mission day. */

/** Radiation numbers for one turn, in game units (game rules, not real dose). */

/** Plain-language explanation for each readout, at most 15 words each. */

/** What happened (or would happen) on one mission day. */

/**
 * A consequence that lands on a later day (e.g. low life support today drains it tomorrow).
 * The engine owns how these are created; the UI only lists them.
 */

/** A committed data file in public/data/. */

/** One real NASA OSDR study, summarised for kids. */

/** ISS dose-rate calibration from RadLab. The Moon number is never invented. */

/** One cited source (title + https URL). */

/**
 * public/data/mars-site.json (B10): real facts about the Mars site, each one cited.
 * Numbers here are real and sourced; game-rule numbers never go in this file.
 */

/** Live space weather built in the browser from NASA DONKI (src/app/live.js, D-040). */

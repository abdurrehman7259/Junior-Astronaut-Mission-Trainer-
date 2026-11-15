/**
 * zod schemas matching ./types.ts one-to-one.
 * Snapshots in public/data/ are validated with these at fetch time (scripts) and at load time (UI).
 * The type assertions at the bottom fail `npm run typecheck` if a schema drifts from its type.
 */
import { z } from 'zod';
import {
  METER_MAX,
  METER_MIN,
  MISSION_DAYS,
  POWER_UNITS_PER_DAY,
  type Allocation,
  type CarryOverEffect,
  type DoseCalibration,
  type GameState,
  type LiveSpaceWeather,
  type MarsSiteInfo,
  type Meters,
  type ScienceFact,
  type SolarEvent,
  type Snapshot,
  type TurnResult,
} from './types';

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const units = z.int().min(0).max(POWER_UNITS_PER_DAY);
const meter = z.int().min(METER_MIN).max(METER_MAX);
const missionDay = z.int().min(1).max(MISSION_DAYS);
const httpsUrl = z.url({ protocol: /^https$/ });
const isoDateTime = z.iso.datetime({ offset: true });

export const AllocationSchema = z
  .object({ life: units, shield: units, science: units })
  .refine((a) => a.life + a.shield + a.science === POWER_UNITS_PER_DAY, {
    message: `Allocation must sum to ${POWER_UNITS_PER_DAY}`,
  });

/** A plan in progress (sum 0..10). Saves store it so a resumed day keeps what was shared (D-038). */
export const DraftAllocationSchema = z
  .object({ life: units, shield: units, science: units })
  .refine((a) => a.life + a.shield + a.science <= POWER_UNITS_PER_DAY, {
    message: `Draft must sum to at most ${POWER_UNITS_PER_DAY}`,
  });

export const MetersSchema = z.object({ power: meter, lifeSupport: meter, crewHealth: meter });

/** Signed per-meter change (used for TurnResult.deltas). */
export const MeterDeltasSchema = z.object({
  power: z.int().min(-METER_MAX).max(METER_MAX),
  lifeSupport: z.int().min(-METER_MAX).max(METER_MAX),
  crewHealth: z.int().min(-METER_MAX).max(METER_MAX),
});

export const SeveritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const SolarEventSchema = z
  .object({
    id: z.string().min(1),
    source: z.literal('DONKI'),
    kind: z.enum(['FLR', 'CME', 'QUIET']),
    realDate: z.iso.date(),
    realTime: z.string().min(1).optional(),
    severity: SeveritySchema,
    flareClass: z.string().regex(/^[ABCMX]\d+(\.\d+)?$/).optional(),
    cmeSpeedKms: z.number().positive().optional(),
    kidText: z.string().min(1),
    sourceUrl: httpsUrl,
    marsImpact: z.enum(['listed', 'game-only']).optional(),
  })
  .refine((e) => (e.kind === 'QUIET') === (e.severity === 0), {
    message: 'QUIET events have severity 0, and only QUIET events do',
  })
  .refine((e) => e.kind !== 'FLR' || e.flareClass !== undefined, {
    message: 'FLR events need a flareClass',
  });

export const DoseBreakdownSchema = z.object({
  incoming: z.number().min(0),
  blocked: z.number().min(0),
  received: z.number().min(0),
});

const explanation = z
  .string()
  .min(1)
  .refine((s) => countWords(s) <= 15, { message: 'Explanation must be 15 words or fewer' });

export const TurnExplanationsSchema = z.object({
  power: explanation,
  lifeSupport: explanation,
  crewHealth: explanation,
  science: explanation,
});

export const GameStatusSchema = z.enum(['playing', 'won', 'ended']);

export const TurnResultSchema = z.object({
  day: missionDay,
  allocation: AllocationSchema,
  event: SolarEventSchema,
  before: MetersSchema,
  after: MetersSchema,
  deltas: MeterDeltasSchema,
  scienceBefore: z.number().min(0),
  scienceGained: z.number().min(0),
  scienceAfter: z.number().min(0),
  dose: DoseBreakdownSchema,
  explanations: TurnExplanationsSchema,
  statusAfter: GameStatusSchema,
});

export const CarryOverEffectSchema = z.object({
  id: z.string().min(1),
  dueDay: z.int().min(1),
  meter: z.enum(['power', 'lifeSupport', 'crewHealth']),
  delta: z.number(),
  reason: explanation,
});

/** Used to validate a saved game from localStorage before resuming (FR-14). */
export const GameStateSchema = z.object({
  day: missionDay,
  meters: MetersSchema,
  scienceScore: z.number().min(0),
  history: z.array(TurnResultSchema).max(MISSION_DAYS),
  seed: z.int(),
  eventSetId: z.string().min(1),
  events: z.array(SolarEventSchema).length(MISSION_DAYS),
  carryOver: z.array(CarryOverEffectSchema),
  status: GameStatusSchema,
  site: z.enum(['moon', 'mars']).optional(),
});

/** Schema for a Snapshot<T> file, given the item schema. */
export function snapshotSchema<T extends z.ZodType>(item: T) {
  return z.object({
    retrievedAt: isoDateTime,
    source: z.string().min(1),
    sourceUrl: httpsUrl,
    window: z.object({ startDate: z.iso.date(), endDate: z.iso.date() }).optional(),
    notes: z.string().optional(),
    items: z.array(item),
  });
}

/** public/data/donki-events.json (B1): at least 30 items, at least 5 of them severity 3, at least 10 QUIET. */
export const DonkiSnapshotSchema = snapshotSchema(SolarEventSchema)
  .refine((s) => s.items.length >= 30, { message: 'Need at least 30 events' })
  .refine((s) => s.items.filter((e) => e.severity === 3).length >= 5, {
    message: 'Need at least 5 severity-3 events',
  })
  .refine((s) => s.items.filter((e) => e.kind === 'QUIET').length >= 10, {
    message: 'Need at least 10 QUIET days',
  })
  .refine((s) => new Set(s.items.map((e) => e.id)).size === s.items.length, {
    message: 'Event ids must be unique',
  });

/**
 * public/data/donki-mars-events.json (B10): >= 15 items, >= 8 storms (>= 3 at severity >= 2), >= 7 QUIET,
 * unique ids, and every storm carries marsImpact ('listed' preferred; 'game-only' when fewer than 10 are listed).
 */
export const DonkiMarsSnapshotSchema = snapshotSchema(SolarEventSchema)
  .refine((s) => s.items.length >= 15, { message: 'Need at least 15 events' })
  .refine((s) => s.items.filter((e) => e.kind !== 'QUIET').length >= 8, { message: 'Need at least 8 storms' })
  .refine((s) => s.items.filter((e) => e.severity >= 2).length >= 3, { message: 'Need at least 3 storms at severity >= 2' })
  .refine((s) => s.items.filter((e) => e.kind === 'QUIET').length >= 7, { message: 'Need at least 7 QUIET days' })
  .refine((s) => s.items.every((e) => e.kind === 'QUIET' || e.marsImpact !== undefined), {
    message: 'Every Mars storm needs marsImpact',
  })
  .refine((s) => new Set(s.items.map((e) => e.id)).size === s.items.length, { message: 'Event ids must be unique' });

const SourceRefSchema = z.object({ title: z.string().min(1), url: httpsUrl });

/** public/data/mars-site.json (B10). */
export const MarsSiteInfoSchema = z.object({
  name: z.string().min(1),
  summary: z
    .string()
    .min(1)
    .refine((s) => countWords(s) <= 25, { message: 'Summary must be 25 words or fewer' }),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(360),
  marsTrekUrl: httpsUrl,
  imageUrl: httpsUrl.optional(),
  imageCredit: z.string().min(1).optional(),
  solLength: z.string().min(1),
  lightTimeMinutes: z.object({ min: z.number().positive(), max: z.number().positive() }),
  sources: z.array(SourceRefSchema).min(1),
  retrievedAt: isoDateTime,
});

export const ScienceFactSchema = z.object({
  id: z.string().min(1),
  text: z
    .string()
    .min(1)
    .refine((s) => countWords(s) <= 25, { message: 'Fact text must be 25 words or fewer' }),
  studyTitle: z.string().min(1),
  osdrUrl: httpsUrl,
  topic: z.enum(['bone', 'muscle', 'radiation']).optional(),
});

/** public/data/osdr-facts.json (B5). */
export const OsdrSnapshotSchema = snapshotSchema(ScienceFactSchema);

/** public/data/radlab-dose.json (B4). */
export const DoseCalibrationSchema = z.object({
  issDoseRateMicroGyPerDay: z.number().positive(),
  retrievedAt: isoDateTime,
  note: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: httpsUrl,
});

/** Body of GET /.netlify/functions/space-weather (B6). */
export const LiveSpaceWeatherSchema = z.discriminatedUnion('live', [
  z.object({ live: z.literal(true), fetchedAt: isoDateTime, events: z.array(SolarEventSchema) }),
  z.object({ live: z.literal(false) }),
]);

// ---- Compile-time drift checks: schema output must equal the hand-written type. ----
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type SchemaTypeChecks = [
  Assert<Equal<z.infer<typeof AllocationSchema>, Allocation>>,
  Assert<Equal<z.infer<typeof MetersSchema>, Meters>>,
  Assert<Equal<z.infer<typeof SolarEventSchema>, SolarEvent>>,
  Assert<Equal<z.infer<typeof TurnResultSchema>, TurnResult>>,
  Assert<Equal<z.infer<typeof CarryOverEffectSchema>, CarryOverEffect>>,
  Assert<Equal<z.infer<typeof GameStateSchema>, GameState>>,
  Assert<Equal<z.infer<typeof DonkiSnapshotSchema>, Snapshot<SolarEvent>>>,
  Assert<Equal<z.infer<typeof ScienceFactSchema>, ScienceFact>>,
  Assert<Equal<z.infer<typeof OsdrSnapshotSchema>, Snapshot<ScienceFact>>>,
  Assert<Equal<z.infer<typeof DoseCalibrationSchema>, DoseCalibration>>,
  Assert<Equal<z.infer<typeof LiveSpaceWeatherSchema>, LiveSpaceWeather>>,
  Assert<Equal<z.infer<typeof DonkiMarsSnapshotSchema>, Snapshot<SolarEvent>>>,
  Assert<Equal<z.infer<typeof MarsSiteInfoSchema>, MarsSiteInfo>>,
];

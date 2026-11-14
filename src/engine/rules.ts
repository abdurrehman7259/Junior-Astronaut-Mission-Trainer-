/** GAME RULES: invented for gameplay balance, not real measurements */
export const RULES = {
  start: {
    power: 65, // Starting battery reserve.
    lifeSupport: 80, // Starting air and water readiness.
    crewHealth: 90, // Starting crew health.
    scienceScore: 0, // Starting science points.
  },
  lifeSupportMinUnits: 4, // Life units needed to avoid tomorrow's air loss.
  lifeSupportDrainPerMissingUnit: 10, // Air loss per missing life unit; immediate on the final day.
  lifeSupportRecoveryPerExtraUnit: 2, // Air restored today per life unit above the minimum.
  dosePerSeverity: [0, 15, 30, 45], // Incoming game dose for quiet, minor, moderate and strong events.
  shieldHalfProtectionUnits: 3, // Shield units blocking half the incoming dose; more give smaller gains.
  healthLossPerDose: 1, // Health lost per received game dose unit.
  sciencePerUnit: 5, // Science points earned per science unit.
  powerRechargePerDay: 5, // Daily reserve recharge on quiet and flare days.
  powerRechargeOnCme: 4, // Reduced reserve recharge on CME days.
  powerCostPerShieldUnit: 2, // Extra reserve consumed by each shield unit.
  powerCostPerScienceUnit: 3, // Extra reserve consumed by each science unit.
  brownoutLifeSupportDrain: 15, // Air loss on empty reserve; immediate on the final day.
  strategy: {
    lifeUnits: 4, // Simulator adaptive policy: daily life allocation.
    shieldPerSeverity: 2, // Simulator adaptive policy: shield units per severity step.
    lowLifeSupport: 40, // Adaptive-plus starts air recovery below this meter.
    recoveryLifeUnits: 6, // Adaptive-plus life allocation during recovery.
    lowCrewHealth: 40, // Adaptive-plus adds protection below this meter.
    extraShield: 1, // Adaptive-plus extra shield units when crew health is low.
  },
  draw: {
    minStorms: 3, // Fewest storm events in a mission.
    maxStorms: 5, // Most storm events in a mission.
    requiredSeverity: 2, // At least one storm must reach this severity.
    maxConsecutiveStorms: 2, // Maximum adjacent storm days when arranging the mission.
    maxAttempts: 128, // Bounded attempts to avoid previously played event set ids.
  },
} as const;

// Widen numeric literals so simulators can pass { ...RULES, sciencePerUnit: 6 }.
type NumericRules<T> = { readonly [K in keyof T]: T[K] extends number ? number : NumericRules<T[K]> };
export type EngineRules = NumericRules<typeof RULES>;

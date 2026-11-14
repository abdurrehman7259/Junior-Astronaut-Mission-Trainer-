/** GAME RULES: invented for gameplay balance, not real measurements */
export const RULES = {
  start: {
    power: 65, // Starting battery reserve.
    lifeSupport: 80, // Starting air and water readiness.
    crewHealth: 90, // Starting crew health.
    scienceScore: 0, // Starting science points.
  },
  lifeSupportMinUnits: 4, // Life units needed to avoid tomorrow's air loss.
  lifeSupportDrainPerMissingUnit: 5, // Tomorrow's air loss for each missing life unit.
  lifeSupportRecoveryPerExtraUnit: 2, // Air restored today per life unit above the minimum.
  dosePerSeverity: [0, 12, 24, 36], // Incoming game dose for quiet, minor, moderate and strong events.
  shieldHalfProtectionUnits: 3, // Shield units blocking half the incoming dose; more give smaller gains.
  healthLossPerDose: 1, // Health lost per received game dose unit.
  sciencePerUnit: 5, // Science points earned per science unit.
  powerRechargePerDay: 8, // Daily reserve recharge on quiet and flare days.
  powerRechargeOnCme: 4, // Reduced reserve recharge on CME days.
  powerCostPerShieldUnit: 2, // Extra reserve consumed by each shield unit.
  powerCostPerScienceUnit: 3, // Extra reserve consumed by each science unit.
  brownoutLifeSupportDrain: 6, // Tomorrow's air loss when today's reserve finishes empty.
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

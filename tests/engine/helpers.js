import { MISSION_DAYS, POWER_UNITS_PER_DAY } from '../../src/shared/types.js';
import { EVENTS } from './fixtures/events.js';

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const allocations = [];
for (let life = 0; life <= POWER_UNITS_PER_DAY; life++) {
  for (let shield = 0; shield <= POWER_UNITS_PER_DAY - life; shield++) {
    allocations.push({ life, shield, science: POWER_UNITS_PER_DAY - life - shield });
  }
}
export const balanced = { life: 4, shield: 3, science: 3 };

/** Controlled missions for individual rule tests; ids stay unique. */
export function daysOf(kind, severity) {
  const template = EVENTS.find(
    (event) => event.kind === kind && (severity === undefined || event.severity === severity),
  );
  return Array.from({ length: MISSION_DAYS }, (_, i) => ({ ...template, id: `FIXTURE-DAY-${i}` }));
}

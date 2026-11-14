import type { Allocation, SolarEvent } from '../../src/shared/types';
import { MISSION_DAYS, POWER_UNITS_PER_DAY } from '../../src/shared/types';
import { EVENTS } from './fixtures/events';

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const allocations: Allocation[] = [];
for (let life = 0; life <= POWER_UNITS_PER_DAY; life++) {
  for (let shield = 0; shield <= POWER_UNITS_PER_DAY - life; shield++) {
    allocations.push({ life, shield, science: POWER_UNITS_PER_DAY - life - shield });
  }
}
export const balanced: Allocation = { life: 4, shield: 3, science: 3 };

/** Controlled missions for individual rule tests; ids stay unique. */
export function daysOf(kind: SolarEvent['kind'], severity?: SolarEvent['severity']): SolarEvent[] {
  const template = EVENTS.find(event => event.kind === kind && (severity === undefined || event.severity === severity))!;
  return Array.from({ length: MISSION_DAYS }, (_, i) => ({ ...template, id: `FIXTURE-DAY-${i}` }));
}

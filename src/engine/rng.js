/** Mulberry32: arithmetic constants define the PRNG, not gameplay balance. */
export function createRng(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }
  /** Inclusive integer interval. */
  function int(min, max) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new RangeError('Random integer bounds must be whole numbers with min <= max.');
    }
    return min + Math.floor(next() * (max - min + 1));
  }
  function pick(items) {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
    return items[int(0, items.length - 1)];
  }
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  return { next, int, pick, shuffle };
}

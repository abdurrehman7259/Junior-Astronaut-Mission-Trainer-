import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng.js';

describe('seeded random helpers', () => {
  it('matches a stable mulberry32 sequence and normalizes seeds to uint32', () => {
    const rng = createRng(1);
    expect(Array.from({ length: 3 }, () => rng.next())).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
    expect(createRng(-1).next()).toBe(createRng(0xffffffff).next());
    expect(createRng(0x100000000).next()).toBe(createRng(0).next());
  });

  it('produces inclusive integer bounds and reproducible picks and copied shuffles', () => {
    const left = createRng(42);
    const right = createRng(42);
    const values = Object.freeze(['a', 'b', 'c', 'd']);
    const observed = new Set();
    for (let i = 0; i < 100; i++) {
      const n = left.int(-2, 2);
      expect(n).toBe(right.int(-2, 2));
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
      observed.add(n);
      expect(left.pick(values)).toBe(right.pick(values));
      const shuffled = left.shuffle(values);
      expect(shuffled).toEqual(right.shuffle(values));
      expect(shuffled).not.toBe(values);
      expect(shuffled.slice().sort()).toEqual(values);
    }
    expect(observed.size).toBe(5);
    expect(left.int(7, 7)).toBe(7);
    expect(left.shuffle([])).toEqual([]);
    expect(left.shuffle(['only'])).toEqual(['only']);
  });

  it('rejects empty picks and invalid integer intervals', () => {
    const rng = createRng(0);
    expect(() => rng.pick([])).toThrow(RangeError);
    for (const [min, max] of [
      [2, 1],
      [0.5, 1],
      [0, NaN],
      [0, Infinity],
    ]) {
      expect(() => rng.int(min, max)).toThrow(RangeError);
    }
  });
});

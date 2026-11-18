import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSeed } from '../../src/app/state.js';

const isUint32 = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffff_ffff;

describe('newSeed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 50; i++) expect(isUint32(newSeed())).toBe(true);
  });

  it('falls back when getRandomValues throws (sandboxed Firefox), so Start never crashes', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new DOMException('The operation failed for an operation-specific reason', 'OperationError');
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(newSeed()).toBe(0x8000_0000);
  });
});

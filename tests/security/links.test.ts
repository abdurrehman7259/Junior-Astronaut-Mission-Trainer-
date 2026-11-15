import { describe, expect, it } from 'vitest';
import { isAllowedLinkUrl } from '../../src/shared/schemas';

// F3 helper is implemented in the app; these are independent security proofs.
describe('shared citation link allowlist', () => {
  it.each([
    'https://nasa.gov/', 'https://science.nasa.gov/', 'https://ccmc.gsfc.nasa.gov/DONKI/', 'https://noaa.gov/',
  ])('accepts an official HTTPS destination: %s', (url) => {
    expect(isAllowedLinkUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)', 'http://nasa.gov/', '//nasa.gov/', 'https://attacker.invalid/',
    'https://nasa.gov.attacker.invalid/', 'https://evilnasa.gov/', 'https://nasa.gov@attacker.invalid/',
    'https://user:pass@nasa.gov/', 'https://attacker.invalid/https://nasa.gov/', 'https://noaa.gov.attacker.invalid/',
  ])('rejects an unsafe or deceptive destination: %s', (url) => {
    expect(isAllowedLinkUrl(url)).toBe(false);
  });
});

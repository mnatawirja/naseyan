import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin, weakPin } from './pin';
describe('pin', () => {
  it('verifies the right PIN only', async () => {
    const h = await hashPin('482915');
    expect(await verifyPin('482915', h)).toBe(true);
    expect(await verifyPin('482916', h)).toBe(false);
  });
  it('flags obvious PINs', () => {
    expect(weakPin('111111')).toBe(true);
    expect(weakPin('123456')).toBe(true);
    expect(weakPin('482915')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { linear, easeInQuad, easeOutQuad, easeInOutQuad } from '../easing';

describe('Easing Functions', () => {
  it('linear easing', () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
  });

  it('easeInQuad', () => {
    expect(easeInQuad(0)).toBe(0);
    expect(easeInQuad(0.5)).toBe(0.25);
    expect(easeInQuad(1)).toBe(1);
  });

  it('easeOutQuad', () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(0.5)).toBe(0.75);
    expect(easeOutQuad(1)).toBe(1);
  });

  it('easeInOutQuad', () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(0.25)).toBe(0.125);
    expect(easeInOutQuad(0.5)).toBe(0.5); // at exactly 0.5 it may be 0.5 depending on inequality
    expect(easeInOutQuad(0.75)).toBe(0.875);
    expect(easeInOutQuad(1)).toBe(1);
  });
});

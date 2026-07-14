import { describe, it, expect } from 'vitest';
import { tokenizePath } from '../pathTokenizer';

describe('pathTokenizer', () => {
  it('should tokenize simple move and line', () => {
    const tokens = tokenizePath('M 10 10 L 20 20');
    expect(tokens).toEqual([
      { type: 'M', args: [10, 10] },
      { type: 'L', args: [20, 20] }
    ]);
  });

  it('should handle commas and spaces', () => {
    const tokens = tokenizePath('M10,10 L20,20');
    expect(tokens).toEqual([
      { type: 'M', args: [10, 10] },
      { type: 'L', args: [20, 20] }
    ]);
  });

  it('should handle relative commands', () => {
    const tokens = tokenizePath('m 10 10 l 20 20');
    expect(tokens).toEqual([
      { type: 'm', args: [10, 10] },
      { type: 'l', args: [20, 20] }
    ]);
  });

  it('should break multiple args into sub commands', () => {
    const tokens = tokenizePath('M 10 10 20 20 30 30');
    expect(tokens).toEqual([
      { type: 'M', args: [10, 10] },
      { type: 'L', args: [20, 20] },
      { type: 'L', args: [30, 30] } // M command followed by pairs acts as L
    ]);
  });
  
  it('should handle H and V commands', () => {
    const tokens = tokenizePath('H 10 V 20');
    expect(tokens).toEqual([
      { type: 'H', args: [10] },
      { type: 'V', args: [20] }
    ]);
  });

  it('should handle close path', () => {
    const tokens = tokenizePath('Z');
    expect(tokens).toEqual([
      { type: 'Z', args: [] }
    ]);
  });
});

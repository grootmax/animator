import { describe, it, expect } from 'vitest';
import { 
  createMatrix, 
  multiplyMatrix, 
  translateMatrix, 
  rotateMatrix, 
  scaleMatrix, 
  skewMatrix, 
  getTransformMatrix 
} from '../matrix';

describe('Matrix Functions', () => {
  it('should create an identity matrix', () => {
    expect(createMatrix()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('should multiply identity matrices and get identity', () => {
    const a = createMatrix();
    const b = createMatrix();
    expect(multiplyMatrix(a, b)).toEqual(a);
  });

  it('should translate correctly', () => {
    const m = createMatrix();
    const translated = translateMatrix(m, 10, 20);
    expect(translated).toEqual([1, 0, 0, 0, 1, 0, 10, 20, 1]);
  });

  it('should scale correctly', () => {
    const m = createMatrix();
    const scaled = scaleMatrix(m, 2, 3);
    expect(scaled).toEqual([2, 0, 0, 0, 3, 0, 0, 0, 1]);
  });

  it('should rotate correctly', () => {
    const m = createMatrix();
    const rotated = rotateMatrix(m, Math.PI / 2); // 90 deg
    // Floating point precision can be an issue, so we check approximate values or round
    expect(rotated[0]).toBeCloseTo(0);
    expect(rotated[1]).toBeCloseTo(1);
    expect(rotated[3]).toBeCloseTo(-1);
    expect(rotated[4]).toBeCloseTo(0);
  });

  it('should calculate transform matrix correctly', () => {
    const t = getTransformMatrix(10, 20, 0, 2, 2);
    expect(t).toEqual([2, 0, 0, 0, 2, 0, 10, 20, 1]);
  });
  
  it('should skew correctly', () => {
    const m = createMatrix();
    const skewed = skewMatrix(m, Math.PI / 4, 0); // 45 deg skew X
    expect(skewed[0]).toBeCloseTo(1);
    expect(skewed[1]).toBeCloseTo(0);
    expect(skewed[3]).toBeCloseTo(1);
    expect(skewed[4]).toBeCloseTo(1);
  });
});

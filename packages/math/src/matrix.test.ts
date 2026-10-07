import { describe, it, expect } from 'vitest';
import {
  createMatrix,
  multiplyMatrix,
  translateMatrix,
  rotateMatrix,
  scaleMatrix,
  skewMatrix,
  getTransformMatrix,
  copyMatrix,
  identityMatrix,
  Matrix3,
} from './matrix';

describe('Matrix3 in-place operations', () => {
  it('createMatrix returns standard 3x3 identity matrix tuple', () => {
    const m = createMatrix();
    expect(m).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('translateMatrix produces identical results with or without target', () => {
    const m1 = createMatrix();
    const res1 = translateMatrix(m1, 15, 25);

    const m2 = createMatrix();
    const target = createMatrix();
    const res2 = translateMatrix(m2, 15, 25, target);

    expect(res2).toBe(target);
    expect(res1).toEqual(res2);
  });

  it('translateMatrix supports self-mutation (passing m as target)', () => {
    const m1 = createMatrix();
    const expected = translateMatrix(m1, 10, 20);

    const m2 = createMatrix();
    const actual = translateMatrix(m2, 10, 20, m2);

    expect(actual).toBe(m2);
    expect(actual).toEqual(expected);
  });

  it('rotateMatrix produces identical results with or without target and supports self-mutation', () => {
    const angle = Math.PI / 6;
    const m1 = createMatrix();
    const expected = rotateMatrix(m1, angle);

    const m2 = createMatrix();
    const actual = rotateMatrix(m2, angle, m2);

    expect(actual).toBe(m2);
    for (let i = 0; i < 9; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 10);
    }
  });

  it('scaleMatrix produces identical results with or without target and supports self-mutation', () => {
    const m1 = createMatrix();
    const expected = scaleMatrix(m1, 2.5, 4.0);

    const m2 = createMatrix();
    const actual = scaleMatrix(m2, 2.5, 4.0, m2);

    expect(actual).toBe(m2);
    expect(actual).toEqual(expected);
  });

  it('skewMatrix produces identical results with or without target and supports self-mutation', () => {
    const m1 = createMatrix();
    const expected = skewMatrix(m1, 0.1, 0.2);

    const m2 = createMatrix();
    const actual = skewMatrix(m2, 0.1, 0.2, m2);

    expect(actual).toBe(m2);
    for (let i = 0; i < 9; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 10);
    }
  });

  it('multiplyMatrix produces identical results with or without target and supports self-mutation', () => {
    const a = translateMatrix(createMatrix(), 10, 20);
    const b = scaleMatrix(createMatrix(), 2, 3);

    const expected = multiplyMatrix(a, b);

    const aCopy = copyMatrix(createMatrix(), a);
    const actual = multiplyMatrix(aCopy, b, aCopy);

    expect(actual).toBe(aCopy);
    expect(actual).toEqual(expected);
  });

  it('getTransformMatrix performs zero-allocation composition into target matrix', () => {
    const target = createMatrix();
    const res = getTransformMatrix(10, 20, Math.PI / 4, 2, 3, 0.1, 0.2, target);

    expect(res).toBe(target);

    // Verify against step-by-step composition
    const expected = createMatrix();
    translateMatrix(expected, 10, 20, expected);
    rotateMatrix(expected, Math.PI / 4, expected);
    skewMatrix(expected, 0.1, 0.2, expected);
    scaleMatrix(expected, 2, 3, expected);

    for (let i = 0; i < 9; i++) {
      expect(res[i]).toBeCloseTo(expected[i], 10);
    }
  });

  it('copyMatrix and identityMatrix update target array in-place', () => {
    const a: Matrix3 = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const out = createMatrix();

    copyMatrix(out, a);
    expect(out).toEqual(a);

    identityMatrix(out);
    expect(out).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

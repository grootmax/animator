export type Matrix3 = Float32Array;

export const createMatrix = (): Matrix3 => new Float32Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
]);

export const identityMatrix = (out: Matrix3): Matrix3 => {
  out[0] = 1; out[1] = 0; out[2] = 0;
  out[3] = 0; out[4] = 1; out[5] = 0;
  out[6] = 0; out[7] = 0; out[8] = 1;
  return out;
};

export const copyMatrix = (out: Matrix3, a: Matrix3): Matrix3 => {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
  out[3] = a[3]; out[4] = a[4]; out[5] = a[5];
  out[6] = a[6]; out[7] = a[7]; out[8] = a[8];
  return out;
};

export const multiplyMatrix = (out: Matrix3, a?: Matrix3, b?: Matrix3): Matrix3 => {
  let resOut = out;
  let matA = a;
  let matB = b;
  if (matB === undefined) {
    matB = a;
    matA = out;
    resOut = createMatrix();
  }
  const a00 = matA![0], a01 = matA![1], a02 = matA![2];
  const a10 = matA![3], a11 = matA![4], a12 = matA![5];
  const a20 = matA![6], a21 = matA![7], a22 = matA![8];

  const b00 = matB![0], b01 = matB![1], b02 = matB![2];
  const b10 = matB![3], b11 = matB![4], b12 = matB![5];
  const b20 = matB![6], b21 = matB![7], b22 = matB![8];

  resOut[0] = b00 * a00 + b01 * a10 + b02 * a20;
  resOut[1] = b00 * a01 + b01 * a11 + b02 * a21;
  resOut[2] = b00 * a02 + b01 * a12 + b02 * a22;
  resOut[3] = b10 * a00 + b11 * a10 + b12 * a20;
  resOut[4] = b10 * a01 + b11 * a11 + b12 * a21;
  resOut[5] = b10 * a02 + b11 * a12 + b12 * a22;
  resOut[6] = b20 * a00 + b21 * a10 + b22 * a20;
  resOut[7] = b20 * a01 + b21 * a11 + b22 * a21;
  resOut[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return resOut;
};

const TEMP_MATRIX = createMatrix();

export const translateMatrix = (out: Matrix3, m: Matrix3 | number, x?: number, y?: number): Matrix3 => {
  if (y === undefined && typeof m === 'number') {
    y = x!;
    x = m;
    m = out;
    out = createMatrix();
  }
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[6] = x!;
  TEMP_MATRIX[7] = y!;
  return multiplyMatrix(out as Matrix3, m as Matrix3, TEMP_MATRIX);
};

export const rotateMatrix = (out: Matrix3, m: Matrix3 | number, angleRad?: number): Matrix3 => {
  if (angleRad === undefined && typeof m === 'number') {
    angleRad = m;
    m = out;
    out = createMatrix();
  }
  identityMatrix(TEMP_MATRIX);
  const s = Math.sin(angleRad!);
  const c = Math.cos(angleRad!);
  TEMP_MATRIX[0] = c; TEMP_MATRIX[1] = s;
  TEMP_MATRIX[3] = -s; TEMP_MATRIX[4] = c;
  return multiplyMatrix(out as Matrix3, m as Matrix3, TEMP_MATRIX);
};

export const scaleMatrix = (out: Matrix3, m: Matrix3 | number, sx?: number, sy?: number): Matrix3 => {
  if (sy === undefined && typeof m === 'number') {
    sy = sx!;
    sx = m;
    m = out;
    out = createMatrix();
  }
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[0] = sx!;
  TEMP_MATRIX[4] = sy!;
  return multiplyMatrix(out as Matrix3, m as Matrix3, TEMP_MATRIX);
};

export const skewMatrix = (out: Matrix3, m: Matrix3 | number, skewXRad?: number, skewYRad?: number): Matrix3 => {
  if (skewYRad === undefined && typeof m === 'number') {
    skewYRad = skewXRad!;
    skewXRad = m;
    m = out;
    out = createMatrix();
  }
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[1] = Math.tan(skewYRad!);
  TEMP_MATRIX[3] = Math.tan(skewXRad!);
  return multiplyMatrix(out as Matrix3, m as Matrix3, TEMP_MATRIX);
};

export const getTransformMatrix = (
  outOrX: Matrix3 | number,
  xOrY?: number, 
  yOrRot?: number, 
  rotationOrSx?: number, 
  scaleXOrSy?: number, 
  scaleYOrSkewX?: number,
  skewXOrSkewY: number = 0,
  skewY: number = 0
): Matrix3 => {
  let out: Matrix3;
  let x: number;
  let y: number;
  let rotation: number;
  let scaleX: number;
  let scaleY: number;
  let skewX: number;
  let skY: number;

  if (typeof outOrX === 'number') {
    out = createMatrix();
    x = outOrX;
    y = xOrY!;
    rotation = yOrRot!;
    scaleX = rotationOrSx!;
    scaleY = scaleXOrSy!;
    skewX = scaleYOrSkewX || 0;
    skY = skewXOrSkewY || 0;
  } else {
    out = outOrX;
    x = xOrY!;
    y = yOrRot!;
    rotation = rotationOrSx!;
    scaleX = scaleXOrSy!;
    scaleY = scaleYOrSkewX!;
    skewX = skewXOrSkewY;
    skY = skewY;
  }

  if (skewX === 0 && skY === 0) {
    if (rotation === 0) {
      out[0] = scaleX;  out[1] = 0;       out[2] = 0;
      out[3] = 0;       out[4] = scaleY;  out[5] = 0;
      out[6] = x;       out[7] = y;       out[8] = 1;
    } else {
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      out[0] = c * scaleX;  out[1] = s * scaleX;  out[2] = 0;
      out[3] = -s * scaleY; out[4] = c * scaleY;  out[5] = 0;
      out[6] = x;           out[7] = y;           out[8] = 1;
    }
    return out;
  }

  identityMatrix(out);
  translateMatrix(out, out, x, y);
  rotateMatrix(out, out, rotation);
  skewMatrix(out, out, skewX, skY);
  scaleMatrix(out, out, scaleX, scaleY);
  return out;
};

// Aliases for Mut functions for compatibility
export const multiplyMatrixMut = multiplyMatrix;
export const translateMatrixMut = translateMatrix;
export const rotateMatrixMut = rotateMatrix;
export const scaleMatrixMut = scaleMatrix;
export const skewMatrixMut = skewMatrix;
export const getTransformMatrixMut = getTransformMatrix;

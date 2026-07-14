export type Matrix3 = Float32Array | number[];

export const createMatrix = (): Matrix3 => new Float32Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
]);

export const copyMatrix = (out: Matrix3, a: Matrix3) => {
  for (let i = 0; i < 9; i++) out[i] = a[i];
  return out;
};

export const identityMatrix = (out: Matrix3) => {
  out[0] = 1; out[1] = 0; out[2] = 0;
  out[3] = 0; out[4] = 1; out[5] = 0;
  out[6] = 0; out[7] = 0; out[8] = 1;
  return out;
};

export const multiplyMatrix = (out: Matrix3, a: Matrix3, b: Matrix3): Matrix3 => {
  const a00 = a[0], a01 = a[1], a02 = a[2];
  const a10 = a[3], a11 = a[4], a12 = a[5];
  const a20 = a[6], a21 = a[7], a22 = a[8];

  const b00 = b[0], b01 = b[1], b02 = b[2];
  const b10 = b[3], b11 = b[4], b12 = b[5];
  const b20 = b[6], b21 = b[7], b22 = b[8];

  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;
  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;
  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
};

const TEMP_TRANSFORM = new Float32Array(9);
const TEMP_MATRIX = new Float32Array(9);

export const translateMatrix = (out: Matrix3, m: Matrix3, x: number, y: number): Matrix3 => {
  identityMatrix(TEMP_TRANSFORM);
  TEMP_TRANSFORM[6] = x;
  TEMP_TRANSFORM[7] = y;
  return multiplyMatrix(out, m, TEMP_TRANSFORM);
};

export const rotateMatrix = (out: Matrix3, m: Matrix3, angleRad: number): Matrix3 => {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  identityMatrix(TEMP_TRANSFORM);
  TEMP_TRANSFORM[0] = c;
  TEMP_TRANSFORM[1] = s;
  TEMP_TRANSFORM[3] = -s;
  TEMP_TRANSFORM[4] = c;
  return multiplyMatrix(out, m, TEMP_TRANSFORM);
};

export const scaleMatrix = (out: Matrix3, m: Matrix3, sx: number, sy: number): Matrix3 => {
  identityMatrix(TEMP_TRANSFORM);
  TEMP_TRANSFORM[0] = sx;
  TEMP_TRANSFORM[4] = sy;
  return multiplyMatrix(out, m, TEMP_TRANSFORM);
};

export const skewMatrix = (out: Matrix3, m: Matrix3, skewXRad: number, skewYRad: number): Matrix3 => {
  identityMatrix(TEMP_TRANSFORM);
  TEMP_TRANSFORM[1] = Math.tan(skewYRad);
  TEMP_TRANSFORM[3] = Math.tan(skewXRad);
  return multiplyMatrix(out, m, TEMP_TRANSFORM);
};

export const getTransformMatrix = (
  out: Matrix3,
  x: number, 
  y: number, 
  rotation: number, 
  scaleX: number, 
  scaleY: number,
  skewX: number = 0,
  skewY: number = 0
): Matrix3 => {
  identityMatrix(out);
  translateMatrix(out, out, x, y);
  
  if (rotation !== 0) {
    copyMatrix(TEMP_MATRIX, out);
    rotateMatrix(out, TEMP_MATRIX, rotation);
  }
  
  if (skewX !== 0 || skewY !== 0) {
    copyMatrix(TEMP_MATRIX, out);
    skewMatrix(out, TEMP_MATRIX, skewX, skewY);
  }
  
  if (scaleX !== 1 || scaleY !== 1) {
    copyMatrix(TEMP_MATRIX, out);
    scaleMatrix(out, TEMP_MATRIX, scaleX, scaleY);
  }
  
  return out;
};

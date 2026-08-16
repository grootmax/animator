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

const TEMP_MATRIX = createMatrix();

export const translateMatrix = (out: Matrix3, m: Matrix3, x: number, y: number): Matrix3 => {
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[6] = x;
  TEMP_MATRIX[7] = y;
  return multiplyMatrix(out, m, TEMP_MATRIX);
};

export const rotateMatrix = (out: Matrix3, m: Matrix3, angleRad: number): Matrix3 => {
  identityMatrix(TEMP_MATRIX);
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  TEMP_MATRIX[0] = c; TEMP_MATRIX[1] = s;
  TEMP_MATRIX[3] = -s; TEMP_MATRIX[4] = c;
  return multiplyMatrix(out, m, TEMP_MATRIX);
};

export const scaleMatrix = (out: Matrix3, m: Matrix3, sx: number, sy: number): Matrix3 => {
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[0] = sx;
  TEMP_MATRIX[4] = sy;
  return multiplyMatrix(out, m, TEMP_MATRIX);
};

export const skewMatrix = (out: Matrix3, m: Matrix3, skewXRad: number, skewYRad: number): Matrix3 => {
  identityMatrix(TEMP_MATRIX);
  TEMP_MATRIX[1] = Math.tan(skewYRad);
  TEMP_MATRIX[3] = Math.tan(skewXRad);
  return multiplyMatrix(out, m, TEMP_MATRIX);
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
  rotateMatrix(out, out, rotation);
  if (skewX !== 0 || skewY !== 0) {
    skewMatrix(out, out, skewX, skewY);
  }
  scaleMatrix(out, out, scaleX, scaleY);
  return out;
};

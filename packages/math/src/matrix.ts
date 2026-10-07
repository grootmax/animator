export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export const createMatrix = (): Matrix3 => [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
];

export const multiplyMatrix = (out: Matrix3, a: Matrix3, b: Matrix3): Matrix3 => {
  const a0 = a[0], a1 = a[1], a3 = a[3], a4 = a[4], a6 = a[6], a7 = a[7];

  const b0 = b[0], b1 = b[1], b3 = b[3], b4 = b[4], b6 = b[6], b7 = b[7];

  // Fast path for identity matrix 'a'
  if (a0 === 1 && a4 === 1 && a1 === 0 && a3 === 0 && a6 === 0 && a7 === 0) {
    out[0] = b0; out[1] = b1; out[2] = 0;
    out[3] = b3; out[4] = b4; out[5] = 0;
    out[6] = b6; out[7] = b7; out[8] = 1;
    return out;
  }

  out[0] = b0 * a0 + b1 * a3;
  out[1] = b0 * a1 + b1 * a4;
  out[2] = 0;
  out[3] = b3 * a0 + b4 * a3;
  out[4] = b3 * a1 + b4 * a4;
  out[5] = 0;
  out[6] = b6 * a0 + b7 * a3 + a6;
  out[7] = b6 * a1 + b7 * a4 + a7;
  out[8] = 1;

  return out;
};

// We don't change translate/rotate/scale/skew internally but we inline them in getTransformMatrix
// for zero allocations, avoiding intermediate arrays.
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
  if (rotation === 0 && skewX === 0 && skewY === 0) {
    out[0] = scaleX; out[1] = 0;      out[2] = 0;
    out[3] = 0;      out[4] = scaleY; out[5] = 0;
    out[6] = x;      out[7] = y;      out[8] = 1;
    return out;
  }

  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  
  if (skewX === 0 && skewY === 0) {
    out[0] = c * scaleX;
    out[1] = s * scaleX;
    out[2] = 0;
    out[3] = -s * scaleY;
    out[4] = c * scaleY;
    out[5] = 0;
    out[6] = x;
    out[7] = y;
    out[8] = 1;
    return out;
  }

  const tx = Math.tan(skewX);
  const ty = Math.tan(skewY);
  const m00 = c + -s * ty;
  const m01 = s + c * ty;
  const m10 = c * tx + -s;
  const m11 = s * tx + c;
  
  out[0] = m00 * scaleX;
  out[1] = m01 * scaleX;
  out[2] = 0;
  out[3] = m10 * scaleY;
  out[4] = m11 * scaleY;
  out[5] = 0;
  out[6] = x;
  out[7] = y;
  out[8] = 1;
  
  return out;
};

export const translateMatrix = (m: Matrix3, x: number, y: number): Matrix3 => {
  const out = createMatrix();
  return multiplyMatrix(out, m, [
    1, 0, 0,
    0, 1, 0,
    x, y, 1
  ]);
};

export const rotateMatrix = (m: Matrix3, angleRad: number): Matrix3 => {
  const out = createMatrix();
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  return multiplyMatrix(out, m, [
    c, s, 0,
    -s, c, 0,
    0, 0, 1
  ]);
};

export const scaleMatrix = (m: Matrix3, sx: number, sy: number): Matrix3 => {
  const out = createMatrix();
  return multiplyMatrix(out, m, [
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1
  ]);
};

export const skewMatrix = (m: Matrix3, skewXRad: number, skewYRad: number): Matrix3 => {
  const out = createMatrix();
  return multiplyMatrix(out, m, [
    1, Math.tan(skewYRad), 0,
    Math.tan(skewXRad), 1, 0,
    0, 0, 1
  ]);
};

export const copyMatrix = (out: Matrix3, a: Matrix3): Matrix3 => {
  for (let i = 0; i < 9; i++) out[i] = a[i];
  return out;
};

export const identityMatrix = (out: Matrix3): Matrix3 => {
  out[0] = 1; out[1] = 0; out[2] = 0;
  out[3] = 0; out[4] = 1; out[5] = 0;
  out[6] = 0; out[7] = 0; out[8] = 1;
  return out;
};

export const multiplyMatrixMut = (out: Matrix3, a: Matrix3, b: Matrix3): Matrix3 => {
  const a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];
  const b00 = b[0], b01 = b[1], b02 = b[2],
        b10 = b[3], b11 = b[4], b12 = b[5],
        b20 = b[6], b21 = b[7], b22 = b[8];

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

// Temporary matrices to avoid allocation
const _m1 = createMatrix();
const _m2 = createMatrix();
const _m3 = createMatrix();
const _m4 = createMatrix();

export const translateMatrixMut = (out: Matrix3, m: Matrix3, x: number, y: number): Matrix3 => {
  _m1[0] = 1; _m1[1] = 0; _m1[2] = 0;
  _m1[3] = 0; _m1[4] = 1; _m1[5] = 0;
  _m1[6] = x; _m1[7] = y; _m1[8] = 1;
  return multiplyMatrixMut(out, m, _m1);
};

export const rotateMatrixMut = (out: Matrix3, m: Matrix3, angleRad: number): Matrix3 => {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  _m2[0] = c;  _m2[1] = s;  _m2[2] = 0;
  _m2[3] = -s; _m2[4] = c;  _m2[5] = 0;
  _m2[6] = 0;  _m2[7] = 0;  _m2[8] = 1;
  return multiplyMatrixMut(out, m, _m2);
};

export const scaleMatrixMut = (out: Matrix3, m: Matrix3, sx: number, sy: number): Matrix3 => {
  _m3[0] = sx; _m3[1] = 0;  _m3[2] = 0;
  _m3[3] = 0;  _m3[4] = sy; _m3[5] = 0;
  _m3[6] = 0;  _m3[7] = 0;  _m3[8] = 1;
  return multiplyMatrixMut(out, m, _m3);
};

export const skewMatrixMut = (out: Matrix3, m: Matrix3, skewXRad: number, skewYRad: number): Matrix3 => {
  _m4[0] = 1;                  _m4[1] = Math.tan(skewYRad); _m4[2] = 0;
  _m4[3] = Math.tan(skewXRad); _m4[4] = 1;                  _m4[5] = 0;
  _m4[6] = 0;                  _m4[7] = 0;                  _m4[8] = 1;
  return multiplyMatrixMut(out, m, _m4);
};

const _tmpTransform = createMatrix();

export const getTransformMatrixMut = (
  out: Matrix3,
  x: number, 
  y: number, 
  rotation: number, 
  scaleX: number, 
  scaleY: number,
  skewX: number = 0,
  skewY: number = 0
): Matrix3 => {
  identityMatrix(_tmpTransform);
  translateMatrixMut(_tmpTransform, _tmpTransform, x, y);
  rotateMatrixMut(_tmpTransform, _tmpTransform, rotation);
  
  if (skewX !== 0 || skewY !== 0) {
    skewMatrixMut(_tmpTransform, _tmpTransform, skewX, skewY);
  }
  
  scaleMatrixMut(_tmpTransform, _tmpTransform, scaleX, scaleY);
  
  return copyMatrix(out, _tmpTransform);
};

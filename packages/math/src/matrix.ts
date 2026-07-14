export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export const createMatrix = (): Matrix3 => [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
];

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
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  
  let m00 = c;
  let m01 = s;
  let m10 = -s;
  let m11 = c;
  
  if (skewX !== 0 || skewY !== 0) {
    const tx = Math.tan(skewX);
    const ty = Math.tan(skewY);
    // Multiply by skew matrix [1, ty, 0, tx, 1, 0, 0, 0, 1]
    const temp00 = m00 + m10 * ty;
    const temp01 = m01 + m11 * ty;
    const temp10 = m00 * tx + m10;
    const temp11 = m01 * tx + m11;
    m00 = temp00; m01 = temp01;
    m10 = temp10; m11 = temp11;
  }
  
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

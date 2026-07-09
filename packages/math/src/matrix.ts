export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export const createMatrix = (): Matrix3 => [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
];

export const multiplyMatrix = (a: Matrix3, b: Matrix3, target?: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const [b00, b01, b02, b10, b11, b12, b20, b21, b22] = b;

  const r = target || (new Array(9) as unknown as Matrix3);
  r[0] = b00 * a00 + b01 * a10 + b02 * a20;
  r[1] = b00 * a01 + b01 * a11 + b02 * a21;
  r[2] = b00 * a02 + b01 * a12 + b02 * a22;
  r[3] = b10 * a00 + b11 * a10 + b12 * a20;
  r[4] = b10 * a01 + b11 * a11 + b12 * a21;
  r[5] = b10 * a02 + b11 * a12 + b12 * a22;
  r[6] = b20 * a00 + b21 * a10 + b22 * a20;
  r[7] = b20 * a01 + b21 * a11 + b22 * a21;
  r[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return r;
};

export const translateMatrix = (m: Matrix3, x: number, y: number, target?: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = m;
  const r = target || (new Array(9) as unknown as Matrix3);
  r[0] = a00;
  r[1] = a01;
  r[2] = a02;
  r[3] = a10;
  r[4] = a11;
  r[5] = a12;
  r[6] = x * a00 + y * a10 + a20;
  r[7] = x * a01 + y * a11 + a21;
  r[8] = x * a02 + y * a12 + a22;
  return r;
};

export const rotateMatrix = (m: Matrix3, angleRad: number, target?: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = m;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const r = target || (new Array(9) as unknown as Matrix3);
  r[0] = c * a00 + s * a10;
  r[1] = c * a01 + s * a11;
  r[2] = c * a02 + s * a12;
  r[3] = -s * a00 + c * a10;
  r[4] = -s * a01 + c * a11;
  r[5] = -s * a02 + c * a12;
  r[6] = a20;
  r[7] = a21;
  r[8] = a22;
  return r;
};

export const scaleMatrix = (m: Matrix3, sx: number, sy: number, target?: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = m;
  const r = target || (new Array(9) as unknown as Matrix3);
  r[0] = sx * a00;
  r[1] = sx * a01;
  r[2] = sx * a02;
  r[3] = sy * a10;
  r[4] = sy * a11;
  r[5] = sy * a12;
  r[6] = a20;
  r[7] = a21;
  r[8] = a22;
  return r;
};

export const skewMatrix = (m: Matrix3, skewXRad: number, skewYRad: number, target?: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = m;
  const tanX = Math.tan(skewXRad);
  const tanY = Math.tan(skewYRad);
  const r = target || (new Array(9) as unknown as Matrix3);
  r[0] = a00 + tanY * a10;
  r[1] = a01 + tanY * a11;
  r[2] = a02 + tanY * a12;
  r[3] = tanX * a00 + a10;
  r[4] = tanX * a01 + a11;
  r[5] = tanX * a02 + a12;
  r[6] = a20;
  r[7] = a21;
  r[8] = a22;
  return r;
};

export const getTransformMatrix = (
  x: number, 
  y: number, 
  rotation: number, 
  scaleX: number, 
  scaleY: number,
  skewX: number = 0,
  skewY: number = 0,
  target?: Matrix3
): Matrix3 => {
  const m = target || createMatrix();
  
  // Set m to the identity matrix values first
  m[0] = 1; m[1] = 0; m[2] = 0;
  m[3] = 0; m[4] = 1; m[5] = 0;
  m[6] = 0; m[7] = 0; m[8] = 1;

  // Apply sequential transformations in-place on `m`
  translateMatrix(m, x, y, m);
  rotateMatrix(m, rotation, m);
  
  if (skewX !== 0 || skewY !== 0) {
    skewMatrix(m, skewX, skewY, m);
  }
  
  scaleMatrix(m, scaleX, scaleY, m);
  return m;
};

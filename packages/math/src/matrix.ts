export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export const createMatrix = (): Matrix3 => [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
];

export const multiplyMatrix = (a: Matrix3, b: Matrix3): Matrix3 => {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const [b00, b01, b02, b10, b11, b12, b20, b21, b22] = b;

  return [
    b00 * a00 + b01 * a10 + b02 * a20,
    b00 * a01 + b01 * a11 + b02 * a21,
    b00 * a02 + b01 * a12 + b02 * a22,
    b10 * a00 + b11 * a10 + b12 * a20,
    b10 * a01 + b11 * a11 + b12 * a21,
    b10 * a02 + b11 * a12 + b12 * a22,
    b20 * a00 + b21 * a10 + b22 * a20,
    b20 * a01 + b21 * a11 + b22 * a21,
    b20 * a02 + b21 * a12 + b22 * a22,
  ];
};

export const translateMatrix = (m: Matrix3, x: number, y: number): Matrix3 => {
  return multiplyMatrix(m, [
    1, 0, 0,
    0, 1, 0,
    x, y, 1
  ]);
};

export const rotateMatrix = (m: Matrix3, angleRad: number): Matrix3 => {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  return multiplyMatrix(m, [
    c, s, 0,
    -s, c, 0,
    0, 0, 1
  ]);
};

export const scaleMatrix = (m: Matrix3, sx: number, sy: number): Matrix3 => {
  return multiplyMatrix(m, [
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1
  ]);
};

export const skewMatrix = (m: Matrix3, skewXRad: number, skewYRad: number): Matrix3 => {
  return multiplyMatrix(m, [
    1, Math.tan(skewYRad), 0,
    Math.tan(skewXRad), 1, 0,
    0, 0, 1
  ]);
};

export const getTransformMatrix = (
  x: number, 
  y: number, 
  rotation: number, 
  scaleX: number, 
  scaleY: number,
  skewX: number = 0,
  skewY: number = 0
): Matrix3 => {
  let m = createMatrix();
  m = translateMatrix(m, x, y);
  m = rotateMatrix(m, rotation);
  
  if (skewX !== 0 || skewY !== 0) {
    m = skewMatrix(m, skewX, skewY);
  }
  
  m = scaleMatrix(m, scaleX, scaleY);
  return m;
};

export const serializeMatrixToBinary = (matrix: Matrix3): Float32Array => {
  return new Float32Array(matrix);
};

export const deserializeMatrixFromBinary = (array: Float32Array): Matrix3 => {
  return [
    array[0], array[1], array[2],
    array[3], array[4], array[5],
    array[6], array[7], array[8]
  ];
};

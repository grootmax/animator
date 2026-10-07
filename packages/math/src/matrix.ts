export type Matrix3 = Float32Array | number[];

export const createMatrix = (): Matrix3 => new Float32Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
]);

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

export function multiplyMatrix(out: Matrix3, a: Matrix3, b?: Matrix3): Matrix3 {
  let resOut: Matrix3;
  let matA: Matrix3;
  let matB: Matrix3;
  if (b === undefined) {
    resOut = createMatrix();
    matA = out;
    matB = a;
  } else {
    resOut = out;
    matA = a;
    matB = b;
  }

  const a00 = matA[0], a01 = matA[1], a02 = matA[2];
  const a10 = matA[3], a11 = matA[4], a12 = matA[5];
  const a20 = matA[6], a21 = matA[7], a22 = matA[8];

  const b00 = matB[0], b01 = matB[1], b02 = matB[2];
  const b10 = matB[3], b11 = matB[4], b12 = matB[5];
  const b20 = matB[6], b21 = matB[7], b22 = matB[8];

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
}

const TEMP_TRANSFORM = new Float32Array(9);
const TEMP_MATRIX = new Float32Array(9);

export const translateMatrix = (outOrM: Matrix3, mOrX: Matrix3 | number, xOrY: number, yVal?: number): Matrix3 => {
  if (typeof mOrX === 'number') {
    const out = createMatrix();
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[6] = mOrX;
    TEMP_TRANSFORM[7] = xOrY;
    return multiplyMatrix(out, outOrM, TEMP_TRANSFORM);
  } else {
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[6] = xOrY;
    TEMP_TRANSFORM[7] = yVal!;
    return multiplyMatrix(outOrM, mOrX, TEMP_TRANSFORM);
  }
};

export const rotateMatrix = (outOrM: Matrix3, mOrAngle: Matrix3 | number, angleVal?: number): Matrix3 => {
  if (typeof mOrAngle === 'number') {
    const out = createMatrix();
    const s = Math.sin(mOrAngle);
    const c = Math.cos(mOrAngle);
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[0] = c;
    TEMP_TRANSFORM[1] = s;
    TEMP_TRANSFORM[3] = -s;
    TEMP_TRANSFORM[4] = c;
    return multiplyMatrix(out, outOrM, TEMP_TRANSFORM);
  } else {
    const s = Math.sin(angleVal!);
    const c = Math.cos(angleVal!);
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[0] = c;
    TEMP_TRANSFORM[1] = s;
    TEMP_TRANSFORM[3] = -s;
    TEMP_TRANSFORM[4] = c;
    return multiplyMatrix(outOrM, mOrAngle, TEMP_TRANSFORM);
  }
};

export const scaleMatrix = (outOrM: Matrix3, mOrSx: Matrix3 | number, sxOrSy: number, syVal?: number): Matrix3 => {
  if (typeof mOrSx === 'number') {
    const out = createMatrix();
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[0] = mOrSx;
    TEMP_TRANSFORM[4] = sxOrSy;
    return multiplyMatrix(out, outOrM, TEMP_TRANSFORM);
  } else {
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[0] = sxOrSy;
    TEMP_TRANSFORM[4] = syVal!;
    return multiplyMatrix(outOrM, mOrSx, TEMP_TRANSFORM);
  }
};

export const skewMatrix = (outOrM: Matrix3, mOrSkewX: Matrix3 | number, skewXOrSkewY: number, skewYVal?: number): Matrix3 => {
  if (typeof mOrSkewX === 'number') {
    const out = createMatrix();
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[1] = Math.tan(skewXOrSkewY);
    TEMP_TRANSFORM[3] = Math.tan(mOrSkewX);
    return multiplyMatrix(out, outOrM, TEMP_TRANSFORM);
  } else {
    identityMatrix(TEMP_TRANSFORM);
    TEMP_TRANSFORM[1] = Math.tan(skewYVal!);
    TEMP_TRANSFORM[3] = Math.tan(skewXOrSkewY);
    return multiplyMatrix(outOrM, mOrSkewX, TEMP_TRANSFORM);
  }
};

export function computeTransformMatrix(
  out: Matrix3,
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  skewX: number = 0,
  skewY: number = 0
): Matrix3 {
  if (skewX === 0 && skewY === 0) {
    if (rotation === 0) {
      out[0] = scaleX; out[1] = 0;      out[2] = 0;
      out[3] = 0;      out[4] = scaleY; out[5] = 0;
      out[6] = x;      out[7] = y;      out[8] = 1;
    } else {
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      out[0] = c * scaleX;  out[1] = s * scaleX;  out[2] = 0;
      out[3] = -s * scaleY; out[4] = c * scaleY;  out[5] = 0;
      out[6] = x;           out[7] = y;           out[8] = 1;
    }
  } else {
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
  }

  return out;
}

export function getTransformMatrix(
  outOrX: Matrix3 | number,
  xOrY?: number,
  yOrRot?: number,
  rotOrScaleX?: number,
  scaleXOrScaleY?: number,
  scaleYOrSkewX?: number,
  skewXOrSkewY?: number,
  skewYVal?: number
): Matrix3 {
  if (typeof outOrX === 'number') {
    return computeTransformMatrix(
      createMatrix(),
      outOrX,
      xOrY ?? 0,
      yOrRot ?? 0,
      rotOrScaleX ?? 1,
      scaleXOrScaleY ?? 1,
      scaleYOrSkewX ?? 0,
      skewXOrSkewY ?? 0
    );
  } else {
    return computeTransformMatrix(
      outOrX,
      xOrY ?? 0,
      yOrRot ?? 0,
      rotOrScaleX ?? 0,
      scaleXOrScaleY ?? 1,
      scaleYOrSkewX ?? 1,
      skewXOrSkewY ?? 0,
      skewYVal ?? 0
    );
  }
}

export const multiplyMatrixMut = (out: Matrix3, a: Matrix3, b: Matrix3): Matrix3 => {
  return multiplyMatrix(out, a, b);
};

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
  return getTransformMatrix(out, x, y, rotation, scaleX, scaleY, skewX, skewY);
};

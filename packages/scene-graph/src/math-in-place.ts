import { OFFSET_X, OFFSET_Y, OFFSET_ROTATION, OFFSET_SCALE_X, OFFSET_SCALE_Y, OFFSET_SKEW_X, OFFSET_SKEW_Y, OFFSET_LOCAL_MATRIX } from './buffer';

// Temp array to avoid allocations when calling multiplyMatrixInPlace
const TEMP_MATRIX = new Float32Array(9);
const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export const multiplyMatrixInPlace = (
  outBuffer: Float32Array, outOffset: number,
  aBuffer: Float32Array | number[], aOffset: number,
  bBuffer: Float32Array | number[], bOffset: number
) => {
  const a00 = aBuffer[aOffset + 0], a01 = aBuffer[aOffset + 1], a02 = aBuffer[aOffset + 2];
  const a10 = aBuffer[aOffset + 3], a11 = aBuffer[aOffset + 4], a12 = aBuffer[aOffset + 5];
  const a20 = aBuffer[aOffset + 6], a21 = aBuffer[aOffset + 7], a22 = aBuffer[aOffset + 8];

  const b00 = bBuffer[bOffset + 0], b01 = bBuffer[bOffset + 1], b02 = bBuffer[bOffset + 2];
  const b10 = bBuffer[bOffset + 3], b11 = bBuffer[bOffset + 4], b12 = bBuffer[bOffset + 5];
  const b20 = bBuffer[bOffset + 6], b21 = bBuffer[bOffset + 7], b22 = bBuffer[bOffset + 8];

  outBuffer[outOffset + 0] = b00 * a00 + b01 * a10 + b02 * a20;
  outBuffer[outOffset + 1] = b00 * a01 + b01 * a11 + b02 * a21;
  outBuffer[outOffset + 2] = b00 * a02 + b01 * a12 + b02 * a22;
  outBuffer[outOffset + 3] = b10 * a00 + b11 * a10 + b12 * a20;
  outBuffer[outOffset + 4] = b10 * a01 + b11 * a11 + b12 * a21;
  outBuffer[outOffset + 5] = b10 * a02 + b11 * a12 + b12 * a22;
  outBuffer[outOffset + 6] = b20 * a00 + b21 * a10 + b22 * a20;
  outBuffer[outOffset + 7] = b20 * a01 + b21 * a11 + b22 * a21;
  outBuffer[outOffset + 8] = b20 * a02 + b21 * a12 + b22 * a22;
};

export const updateLocalMatrixInPlace = (buffer: Float32Array, offset: number) => {
  const x = buffer[offset + OFFSET_X];
  const y = buffer[offset + OFFSET_Y];
  const rotation = buffer[offset + OFFSET_ROTATION];
  const scaleX = buffer[offset + OFFSET_SCALE_X];
  const scaleY = buffer[offset + OFFSET_SCALE_Y];
  const skewX = buffer[offset + OFFSET_SKEW_X];
  const skewY = buffer[offset + OFFSET_SKEW_Y];

  const locOffset = offset + OFFSET_LOCAL_MATRIX;

  // Initialize with identity
  buffer.set(IDENTITY_MATRIX, locOffset);

  // Translate
  TEMP_MATRIX.set(IDENTITY_MATRIX);
  TEMP_MATRIX[6] = x;
  TEMP_MATRIX[7] = y;
  multiplyMatrixInPlace(buffer, locOffset, buffer, locOffset, TEMP_MATRIX, 0);

  // Rotate
  if (rotation !== 0) {
    const s = Math.sin(rotation);
    const c = Math.cos(rotation);
    TEMP_MATRIX.set(IDENTITY_MATRIX);
    TEMP_MATRIX[0] = c;
    TEMP_MATRIX[1] = s;
    TEMP_MATRIX[3] = -s;
    TEMP_MATRIX[4] = c;
    multiplyMatrixInPlace(buffer, locOffset, buffer, locOffset, TEMP_MATRIX, 0);
  }

  // Skew
  if (skewX !== 0 || skewY !== 0) {
    TEMP_MATRIX.set(IDENTITY_MATRIX);
    TEMP_MATRIX[1] = Math.tan(skewY);
    TEMP_MATRIX[3] = Math.tan(skewX);
    multiplyMatrixInPlace(buffer, locOffset, buffer, locOffset, TEMP_MATRIX, 0);
  }

  // Scale
  if (scaleX !== 1 || scaleY !== 1) {
    TEMP_MATRIX.set(IDENTITY_MATRIX);
    TEMP_MATRIX[0] = scaleX;
    TEMP_MATRIX[4] = scaleY;
    multiplyMatrixInPlace(buffer, locOffset, buffer, locOffset, TEMP_MATRIX, 0);
  }
};

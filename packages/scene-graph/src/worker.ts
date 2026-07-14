export const workerCode = `
// Web worker for matrix calculations

const STRIDE = 32;
const OFF_X = 0;
const OFF_Y = 1;
const OFF_ROT = 2;
const OFF_SX = 3;
const OFF_SY = 4;
const OFF_SKX = 5;
const OFF_SKY = 6;
const OFF_OPACITY = 7;
const OFF_LM_START = 8;
const OFF_WM_START = 17;

const OFF_PARENT = 26;
const OFF_FIRST_CHILD = 27;
const OFF_NEXT_SIBLING = 28;
const OFF_FLAGS = 29;

let f32 = null;
let i32 = null;

// Preallocate temporary matrices to avoid GC
const m = new Float32Array(9);
const rotM = new Float32Array(9);
const mSkew = new Float32Array(9);
const scaleM = new Float32Array(9);
const temp1 = new Float32Array(9);
const temp2 = new Float32Array(9);
const temp3 = new Float32Array(9);

function multiplyMatrix(a, aOffset, b, bOffset, out, outOffset) {
  const a00 = a[aOffset + 0], a01 = a[aOffset + 1], a02 = a[aOffset + 2];
  const a10 = a[aOffset + 3], a11 = a[aOffset + 4], a12 = a[aOffset + 5];
  const a20 = a[aOffset + 6], a21 = a[aOffset + 7], a22 = a[aOffset + 8];

  const b00 = b[bOffset + 0], b01 = b[bOffset + 1], b02 = b[bOffset + 2];
  const b10 = b[bOffset + 3], b11 = b[bOffset + 4], b12 = b[bOffset + 5];
  const b20 = b[bOffset + 6], b21 = b[bOffset + 7], b22 = b[bOffset + 8];

  out[outOffset + 0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[outOffset + 1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[outOffset + 2] = b00 * a02 + b01 * a12 + b02 * a22;
  out[outOffset + 3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[outOffset + 4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[outOffset + 5] = b10 * a02 + b11 * a12 + b12 * a22;
  out[outOffset + 6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[outOffset + 7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[outOffset + 8] = b20 * a02 + b21 * a12 + b22 * a22;
}

function computeLocalMatrix(idx) {
  const x = f32[idx + OFF_X];
  const y = f32[idx + OFF_Y];
  const rot = f32[idx + OFF_ROT];
  const sx = f32[idx + OFF_SX];
  const sy = f32[idx + OFF_SY];
  const skx = f32[idx + OFF_SKX];
  const sky = f32[idx + OFF_SKY];

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  
  m[0] = 1; m[1] = 0; m[2] = 0;
  m[3] = 0; m[4] = 1; m[5] = 0;
  m[6] = x; m[7] = y; m[8] = 1;
  
  rotM[0] = cos; rotM[1] = sin; rotM[2] = 0;
  rotM[3] = -sin; rotM[4] = cos; rotM[5] = 0;
  rotM[6] = 0; rotM[7] = 0; rotM[8] = 1;
  
  multiplyMatrix(m, 0, rotM, 0, temp1, 0);
  
  if (skx !== 0 || sky !== 0) {
    mSkew[0] = 1; mSkew[1] = Math.tan(sky); mSkew[2] = 0;
    mSkew[3] = Math.tan(skx); mSkew[4] = 1; mSkew[5] = 0;
    mSkew[6] = 0; mSkew[7] = 0; mSkew[8] = 1;
    
    multiplyMatrix(temp1, 0, mSkew, 0, temp2, 0);
    temp1.set(temp2);
  }

  scaleM[0] = sx; scaleM[1] = 0; scaleM[2] = 0;
  scaleM[3] = 0; scaleM[4] = sy; scaleM[5] = 0;
  scaleM[6] = 0; scaleM[7] = 0; scaleM[8] = 1;
  
  multiplyMatrix(temp1, 0, scaleM, 0, temp3, 0);

  for (let i = 0; i < 9; i++) {
    f32[idx + OFF_LM_START + i] = temp3[i];
  }
}

function traverse(nodeIndex, parentWasDirty) {
  const idx = nodeIndex * STRIDE;
  const flags = i32[idx + OFF_FLAGS];
  const isDirty = (flags & 1) !== 0;
  
  const isNowDirty = isDirty || parentWasDirty;

  if (isNowDirty) {
    computeLocalMatrix(idx);
    
    const parentIndex = i32[idx + OFF_PARENT];
    if (parentIndex !== -1) {
      multiplyMatrix(f32, parentIndex * STRIDE + OFF_WM_START, f32, idx + OFF_LM_START, f32, idx + OFF_WM_START);
    } else {
      for (let i = 0; i < 9; i++) {
        f32[idx + OFF_WM_START + i] = f32[idx + OFF_LM_START + i];
      }
    }
    
    // clear dirty bit
    i32[idx + OFF_FLAGS] = flags & ~1;
  }

  let childIndex = i32[idx + OFF_FIRST_CHILD];
  while (childIndex !== -1) {
    traverse(childIndex, isNowDirty);
    childIndex = i32[childIndex * STRIDE + OFF_NEXT_SIBLING];
  }
}

self.onmessage = (e) => {
  if (e.data.type === "INIT") {
    f32 = new Float32Array(e.data.sab);
    i32 = new Int32Array(e.data.sab);
  } else if (e.data.type === "TICK") {
    const rootIndex = e.data.rootIndex;
    if (rootIndex !== -1 && f32 && i32) {
      traverse(rootIndex, false);
    }
    self.postMessage({ type: "DONE" });
  }
};
`;

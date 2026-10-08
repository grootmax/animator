export const HEADER_MAGIC = 0x414e494d; // "ANIM" in ASCII hex
export const HEADER_VERSION = 1;

// Int32 Header Indices (each index is 4 bytes)
export const HEADER_IDX_MAGIC = 0;
export const HEADER_IDX_VERSION = 1;
export const HEADER_IDX_STATE_FLAGS = 2; // 0: Stopped, 1: Playing, 2: Paused
export const HEADER_IDX_PLAYHEAD_TIME_US = 3; // Time in microseconds (1 sec = 1,000,000 us)
export const HEADER_IDX_CLOCK_TICK_COUNT = 4; // Monotonic frame tick count
export const HEADER_IDX_DURATION_US = 5; // Total duration in microseconds
export const HEADER_IDX_KEYFRAME_COUNT = 6;
export const HEADER_IDX_STRING_TABLE_ENTRIES = 7;
export const HEADER_IDX_STRING_TABLE_BYTES = 8;
export const HEADER_IDX_ACTIVE_PROP_COUNT = 9;
export const HEADER_IDX_SEQUENCE_NUM = 10;

export const HEADER_BYTE_SIZE = 128; // 32 x 4 bytes

export enum PlaybackState {
  Stopped = 0,
  Playing = 1,
  Paused = 2,
}

export enum KeyframeValueType {
  Numeric = 0,
  String = 1,
}

export interface KeyframeData {
  time: number; // in seconds
  property: string;
  value: number | string;
  easing?: string;
}

export interface PropertyState {
  property: string;
  value: number | string;
  valueType: KeyframeValueType;
  lastUpdatedTick: number;
}

export function createSharedBuffer(byteLength: number): SharedArrayBuffer {
  if (typeof SharedArrayBuffer !== "undefined") {
    return new SharedArrayBuffer(byteLength);
  }
  return new ArrayBuffer(byteLength) as unknown as SharedArrayBuffer;
}

export function readAtomicInt32(view: Int32Array, index: number): number {
  if (
    typeof Atomics !== "undefined" &&
    view.buffer instanceof SharedArrayBuffer
  ) {
    return Atomics.load(view, index);
  }
  return view[index] ?? 0;
}

export function writeAtomicInt32(
  view: Int32Array,
  index: number,
  value: number,
): void {
  if (
    typeof Atomics !== "undefined" &&
    view.buffer instanceof SharedArrayBuffer
  ) {
    Atomics.store(view, index, value);
  } else {
    view[index] = value;
  }
}

export function addAtomicInt32(
  view: Int32Array,
  index: number,
  value: number,
): number {
  if (
    typeof Atomics !== "undefined" &&
    view.buffer instanceof SharedArrayBuffer
  ) {
    return Atomics.add(view, index, value);
  }
  const current = view[index] ?? 0;
  view[index] = current + value;
  return current;
}

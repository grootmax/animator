import {
  ACTIVE_PROP_SLOT_SIZE,
  BinaryTimelineDecoder,
  KEYFRAME_BINARY_SIZE,
} from "./binary-timeline.js";
import {
  HEADER_BYTE_SIZE,
  HEADER_IDX_ACTIVE_PROP_COUNT,
  HEADER_IDX_CLOCK_TICK_COUNT,
  HEADER_IDX_DURATION_US,
  HEADER_IDX_KEYFRAME_COUNT,
  HEADER_IDX_PLAYHEAD_TIME_US,
  HEADER_IDX_SEQUENCE_NUM,
  HEADER_IDX_STATE_FLAGS,
  HEADER_IDX_STRING_TABLE_BYTES,
  HEADER_IDX_STRING_TABLE_ENTRIES,
  KeyframeValueType,
  PlaybackState,
  addAtomicInt32,
  readAtomicInt32,
  writeAtomicInt32,
} from "./layout.js";
import type { StringTable } from "./string-table.js";

export class SharedMemoryClock {
  private buffer: SharedArrayBuffer;
  private int32View: Int32Array;
  private stringTable: StringTable;
  private keyframeOffset: number;
  private activePropsOffset: number;

  constructor(buffer: SharedArrayBuffer, stringTable?: StringTable) {
    this.buffer = buffer;
    this.int32View = new Int32Array(buffer);

    const decoded = BinaryTimelineDecoder.decodeFromBuffer(buffer);
    this.stringTable = stringTable ?? decoded.stringTable;

    const stringCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_STRING_TABLE_ENTRIES,
    );
    const stringBytesCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_STRING_TABLE_BYTES,
    );

    const indexTableByteSize = Math.ceil((stringCount * 8) / 8) * 8;
    const stringBytesAlignedSize = Math.ceil(stringBytesCount / 8) * 8;

    this.keyframeOffset =
      HEADER_BYTE_SIZE + indexTableByteSize + stringBytesAlignedSize;

    const keyframeCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_KEYFRAME_COUNT,
    );
    this.activePropsOffset =
      this.keyframeOffset + keyframeCount * KEYFRAME_BINARY_SIZE;
  }

  public get playheadTimeSeconds(): number {
    const timeUs = readAtomicInt32(this.int32View, HEADER_IDX_PLAYHEAD_TIME_US);
    return timeUs / 1_000_000;
  }

  public setPlayheadTime(seconds: number): void {
    const durationUs = readAtomicInt32(this.int32View, HEADER_IDX_DURATION_US);
    let targetUs = Math.round(seconds * 1_000_000);
    if (durationUs > 0) {
      targetUs = Math.max(0, Math.min(targetUs, durationUs));
    }
    writeAtomicInt32(this.int32View, HEADER_IDX_PLAYHEAD_TIME_US, targetUs);
    this.updateInterpolatedStates();
  }

  public get state(): PlaybackState {
    return readAtomicInt32(this.int32View, HEADER_IDX_STATE_FLAGS);
  }

  public setPlaybackState(state: PlaybackState): void {
    writeAtomicInt32(this.int32View, HEADER_IDX_STATE_FLAGS, state);
  }

  public play(): void {
    this.setPlaybackState(PlaybackState.Playing);
  }

  public pause(): void {
    this.setPlaybackState(PlaybackState.Paused);
  }

  public stop(): void {
    this.setPlaybackState(PlaybackState.Stopped);
    this.setPlayheadTime(0);
  }

  public tick(deltaSeconds: number): void {
    const state = this.state;
    const currentTick =
      addAtomicInt32(this.int32View, HEADER_IDX_CLOCK_TICK_COUNT, 1) + 1;

    if (state === PlaybackState.Playing) {
      const deltaUs = Math.round(deltaSeconds * 1_000_000);
      let newTimeUs =
        readAtomicInt32(this.int32View, HEADER_IDX_PLAYHEAD_TIME_US) + deltaUs;
      const durationUs = readAtomicInt32(
        this.int32View,
        HEADER_IDX_DURATION_US,
      );

      if (durationUs > 0 && newTimeUs >= durationUs) {
        newTimeUs = newTimeUs % durationUs;
      }

      writeAtomicInt32(this.int32View, HEADER_IDX_PLAYHEAD_TIME_US, newTimeUs);
    }

    addAtomicInt32(this.int32View, HEADER_IDX_SEQUENCE_NUM, 1);
    this.updateInterpolatedStates(currentTick);
  }

  public updateInterpolatedStates(currentTick?: number): void {
    const tick =
      currentTick ??
      readAtomicInt32(this.int32View, HEADER_IDX_CLOCK_TICK_COUNT);
    const playheadUs = readAtomicInt32(
      this.int32View,
      HEADER_IDX_PLAYHEAD_TIME_US,
    );
    const playheadTime = playheadUs / 1_000_000;

    const activePropCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_ACTIVE_PROP_COUNT,
    );
    const keyframeCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_KEYFRAME_COUNT,
    );

    const kfView = new DataView(
      this.buffer,
      this.keyframeOffset,
      keyframeCount * KEYFRAME_BINARY_SIZE,
    );
    const propSlotsView = new DataView(
      this.buffer,
      this.activePropsOffset,
      activePropCount * ACTIVE_PROP_SLOT_SIZE,
    );

    for (let p = 0; p < activePropCount; p++) {
      const slotOffset = p * ACTIVE_PROP_SLOT_SIZE;
      const propStringIdx = propSlotsView.getInt32(slotOffset, true);

      // Find preceding keyframe A and succeeding keyframe B for propStringIdx
      let prevTime = -1;
      let prevValType = KeyframeValueType.Numeric;
      let prevNumVal = 0;
      let prevStrIdx = -1;
      let easingIdx = -1;

      let nextTime = Number.POSITIVE_INFINITY;
      let nextValType = KeyframeValueType.Numeric;
      let nextNumVal = 0;
      let nextStrIdx = -1;

      for (let k = 0; k < keyframeCount; k++) {
        const kfOffset = k * KEYFRAME_BINARY_SIZE;
        const kfPropIdx = kfView.getInt32(kfOffset + 4, true);
        if (kfPropIdx !== propStringIdx) continue;

        const kfTime = kfView.getInt32(kfOffset, true) / 1_000_000;
        const valueType = kfView.getInt32(kfOffset + 8, true);

        if (kfTime <= playheadTime) {
          if (kfTime >= prevTime) {
            prevTime = kfTime;
            prevValType = valueType;
            easingIdx = kfView.getInt32(kfOffset + 12, true);
            if (valueType === KeyframeValueType.Numeric) {
              prevNumVal = kfView.getFloat64(kfOffset + 16, true);
            } else {
              prevStrIdx = kfView.getInt32(kfOffset + 24, true);
            }
          }
        } else {
          if (kfTime < nextTime) {
            nextTime = kfTime;
            nextValType = valueType;
            if (valueType === KeyframeValueType.Numeric) {
              nextNumVal = kfView.getFloat64(kfOffset + 16, true);
            } else {
              nextStrIdx = kfView.getInt32(kfOffset + 24, true);
            }
          }
        }
      }

      // Compute interpolated value directly
      if (
        prevTime >= 0 &&
        nextTime < Number.POSITIVE_INFINITY &&
        prevValType === KeyframeValueType.Numeric &&
        nextValType === KeyframeValueType.Numeric
      ) {
        const duration = nextTime - prevTime;
        let t = duration > 0 ? (playheadTime - prevTime) / duration : 0;
        t = Math.max(0, Math.min(1, t));

        // Easing calculations
        const easingName =
          easingIdx >= 0 ? this.stringTable.getString(easingIdx) : undefined;
        if (easingName === "ease-in") {
          t = t * t;
        } else if (easingName === "ease-out") {
          t = t * (2 - t);
        } else if (easingName === "ease-in-out") {
          t = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }

        const interpolatedNum = prevNumVal + t * (nextNumVal - prevNumVal);

        propSlotsView.setInt32(slotOffset + 4, KeyframeValueType.Numeric, true);
        propSlotsView.setInt32(slotOffset + 8, -1, true);
        propSlotsView.setInt32(slotOffset + 12, tick, true);
        propSlotsView.setFloat64(slotOffset + 16, interpolatedNum, true);
      } else if (prevTime >= 0) {
        // Step interpolation / hold value
        propSlotsView.setInt32(slotOffset + 4, prevValType, true);
        propSlotsView.setInt32(slotOffset + 8, prevStrIdx, true);
        propSlotsView.setInt32(slotOffset + 12, tick, true);
        propSlotsView.setFloat64(slotOffset + 16, prevNumVal, true);
      } else if (nextTime < Number.POSITIVE_INFINITY) {
        propSlotsView.setInt32(slotOffset + 4, nextValType, true);
        propSlotsView.setInt32(slotOffset + 8, nextStrIdx, true);
        propSlotsView.setInt32(slotOffset + 12, tick, true);
        propSlotsView.setFloat64(slotOffset + 16, nextNumVal, true);
      }
    }
  }
}

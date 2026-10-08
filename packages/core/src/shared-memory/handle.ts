import {
  ACTIVE_PROP_SLOT_SIZE,
  BinaryTimelineDecoder,
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
  type PlaybackState,
  type PropertyState,
  readAtomicInt32,
} from "./layout.js";
import type { StringTable } from "./string-table.js";

export class AtomicMotionHandle {
  private buffer: SharedArrayBuffer;
  private int32View: Int32Array;
  private stringTable: StringTable;
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

    const keyframeOffset =
      HEADER_BYTE_SIZE + indexTableByteSize + stringBytesAlignedSize;
    const keyframeCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_KEYFRAME_COUNT,
    );

    this.activePropsOffset = keyframeOffset + keyframeCount * 32;
  }

  public get playheadTimeSeconds(): number {
    const timeUs = readAtomicInt32(this.int32View, HEADER_IDX_PLAYHEAD_TIME_US);
    return timeUs / 1_000_000;
  }

  public get tickCount(): number {
    return readAtomicInt32(this.int32View, HEADER_IDX_CLOCK_TICK_COUNT);
  }

  public get playbackState(): PlaybackState {
    return readAtomicInt32(this.int32View, HEADER_IDX_STATE_FLAGS);
  }

  public get sequenceNumber(): number {
    return readAtomicInt32(this.int32View, HEADER_IDX_SEQUENCE_NUM);
  }

  public get durationSeconds(): number {
    const durationUs = readAtomicInt32(this.int32View, HEADER_IDX_DURATION_US);
    return durationUs / 1_000_000;
  }

  public getPropertyState(propertyName: string): PropertyState | undefined {
    const activePropCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_ACTIVE_PROP_COUNT,
    );
    const propSlotsView = new DataView(
      this.buffer,
      this.activePropsOffset,
      activePropCount * ACTIVE_PROP_SLOT_SIZE,
    );

    for (let p = 0; p < activePropCount; p++) {
      const slotOffset = p * ACTIVE_PROP_SLOT_SIZE;
      const propStringIdx = propSlotsView.getInt32(slotOffset, true);
      const name = this.stringTable.getString(propStringIdx);

      if (name === propertyName) {
        const valueType = propSlotsView.getInt32(slotOffset + 4, true);
        const strValIdx = propSlotsView.getInt32(slotOffset + 8, true);
        const lastUpdatedTick = propSlotsView.getInt32(slotOffset + 12, true);

        if (valueType === KeyframeValueType.Numeric) {
          const numVal = propSlotsView.getFloat64(slotOffset + 16, true);
          return {
            property: propertyName,
            value: numVal,
            valueType: KeyframeValueType.Numeric,
            lastUpdatedTick,
          };
        }
        const strVal = this.stringTable.getString(strValIdx) ?? "";
        return {
          property: propertyName,
          value: strVal,
          valueType: KeyframeValueType.String,
          lastUpdatedTick,
        };
      }
    }
    return undefined;
  }

  public getAllPropertyStates(): Record<string, number | string> {
    const activePropCount = readAtomicInt32(
      this.int32View,
      HEADER_IDX_ACTIVE_PROP_COUNT,
    );
    const propSlotsView = new DataView(
      this.buffer,
      this.activePropsOffset,
      activePropCount * ACTIVE_PROP_SLOT_SIZE,
    );
    const result: Record<string, number | string> = {};

    for (let p = 0; p < activePropCount; p++) {
      const slotOffset = p * ACTIVE_PROP_SLOT_SIZE;
      const propStringIdx = propSlotsView.getInt32(slotOffset, true);
      const name = this.stringTable.getString(propStringIdx);
      if (!name) continue;

      const valueType = propSlotsView.getInt32(slotOffset + 4, true);
      if (valueType === KeyframeValueType.Numeric) {
        result[name] = propSlotsView.getFloat64(slotOffset + 16, true);
      } else {
        const strValIdx = propSlotsView.getInt32(slotOffset + 8, true);
        result[name] = this.stringTable.getString(strValIdx) ?? "";
      }
    }
    return result;
  }

  public getStringTable(): StringTable {
    return this.stringTable;
  }
}

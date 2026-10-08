import {
  HEADER_BYTE_SIZE,
  HEADER_IDX_ACTIVE_PROP_COUNT,
  HEADER_IDX_CLOCK_TICK_COUNT,
  HEADER_IDX_DURATION_US,
  HEADER_IDX_KEYFRAME_COUNT,
  HEADER_IDX_MAGIC,
  HEADER_IDX_PLAYHEAD_TIME_US,
  HEADER_IDX_SEQUENCE_NUM,
  HEADER_IDX_STATE_FLAGS,
  HEADER_IDX_STRING_TABLE_BYTES,
  HEADER_IDX_STRING_TABLE_ENTRIES,
  HEADER_IDX_VERSION,
  HEADER_MAGIC,
  HEADER_VERSION,
  type KeyframeData,
  KeyframeValueType,
  PlaybackState,
  createSharedBuffer,
  writeAtomicInt32,
} from "./layout.js";
import { StringTable } from "./string-table.js";

export const KEYFRAME_BINARY_SIZE = 32; // 32 bytes per keyframe
export const ACTIVE_PROP_SLOT_SIZE = 32; // 32 bytes per property slot

export function encodeBinaryTimeline(
  keyframes: KeyframeData[],
  durationSeconds = 10,
): { buffer: SharedArrayBuffer; stringTable: StringTable } {
  // 1. Gather all unique strings for StringTable
  const stringTable = new StringTable();

  // Sort keyframes by time
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

  const propertiesSet = new Set<string>();
  for (const kf of sortedKeyframes) {
    propertiesSet.add(kf.property);
    stringTable.getOrAdd(kf.property);
    if (typeof kf.value === "string") {
      stringTable.getOrAdd(kf.value);
    }
    if (kf.easing) {
      stringTable.getOrAdd(kf.easing);
    }
  }

  const uniqueProperties = Array.from(propertiesSet);

  // 2. Encode String Table
  const { indexTable, byteBuffer } = stringTable.encodeToBinary();
  const stringCount = stringTable.count;
  const stringBytesCount = byteBuffer.byteLength;

  // Align string table index and bytes size to 8-byte boundary
  const indexTableByteSize = Math.ceil((stringCount * 8) / 8) * 8;
  const stringBytesAlignedSize = Math.ceil(stringBytesCount / 8) * 8;

  const keyframesByteSize = sortedKeyframes.length * KEYFRAME_BINARY_SIZE;
  const activePropsByteSize = uniqueProperties.length * ACTIVE_PROP_SLOT_SIZE;

  const totalByteSize =
    HEADER_BYTE_SIZE +
    indexTableByteSize +
    stringBytesAlignedSize +
    keyframesByteSize +
    activePropsByteSize;

  const buffer = createSharedBuffer(totalByteSize);

  // 3. Write Header
  const int32View = new Int32Array(buffer);
  writeAtomicInt32(int32View, HEADER_IDX_MAGIC, HEADER_MAGIC);
  writeAtomicInt32(int32View, HEADER_IDX_VERSION, HEADER_VERSION);
  writeAtomicInt32(int32View, HEADER_IDX_STATE_FLAGS, PlaybackState.Stopped);
  writeAtomicInt32(int32View, HEADER_IDX_PLAYHEAD_TIME_US, 0);
  writeAtomicInt32(int32View, HEADER_IDX_CLOCK_TICK_COUNT, 0);
  writeAtomicInt32(
    int32View,
    HEADER_IDX_DURATION_US,
    Math.round(durationSeconds * 1_000_000),
  );
  writeAtomicInt32(
    int32View,
    HEADER_IDX_KEYFRAME_COUNT,
    sortedKeyframes.length,
  );
  writeAtomicInt32(int32View, HEADER_IDX_STRING_TABLE_ENTRIES, stringCount);
  writeAtomicInt32(int32View, HEADER_IDX_STRING_TABLE_BYTES, stringBytesCount);
  writeAtomicInt32(
    int32View,
    HEADER_IDX_ACTIVE_PROP_COUNT,
    uniqueProperties.length,
  );
  writeAtomicInt32(int32View, HEADER_IDX_SEQUENCE_NUM, 0);

  // 4. Write String Table Data
  let offset = HEADER_BYTE_SIZE;

  // Copy Index Table (Int32)
  const destIndexTable = new Int32Array(buffer, offset, stringCount * 2);
  destIndexTable.set(indexTable);
  offset += indexTableByteSize;

  // Copy Byte Buffer
  const destBytes = new Uint8Array(buffer, offset, stringBytesCount);
  destBytes.set(byteBuffer);
  offset += stringBytesAlignedSize;

  // 5. Write Keyframes
  const kfDataView = new DataView(buffer, offset, keyframesByteSize);
  for (let i = 0; i < sortedKeyframes.length; i++) {
    const kf = sortedKeyframes[i];
    if (!kf) continue;
    const kfOffset = i * KEYFRAME_BINARY_SIZE;
    const timeUs = Math.round(kf.time * 1_000_000);
    const propIdx = stringTable.getOrAdd(kf.property);
    const easingIdx = kf.easing ? stringTable.getOrAdd(kf.easing) : -1;

    kfDataView.setInt32(kfOffset, timeUs, true);
    kfDataView.setInt32(kfOffset + 4, propIdx, true);

    if (typeof kf.value === "number") {
      kfDataView.setInt32(kfOffset + 8, KeyframeValueType.Numeric, true);
      kfDataView.setInt32(kfOffset + 12, easingIdx, true);
      kfDataView.setFloat64(kfOffset + 16, kf.value, true); // 16..23
      kfDataView.setInt32(kfOffset + 24, -1, true); // stringValueIndex
      kfDataView.setInt32(kfOffset + 28, 0, true); // reserved
    } else {
      kfDataView.setInt32(kfOffset + 8, KeyframeValueType.String, true);
      kfDataView.setInt32(kfOffset + 12, easingIdx, true);
      kfDataView.setFloat64(kfOffset + 16, 0, true);
      const strValIdx = stringTable.getOrAdd(kf.value);
      kfDataView.setInt32(kfOffset + 24, strValIdx, true);
      kfDataView.setInt32(kfOffset + 28, 0, true);
    }
  }
  offset += keyframesByteSize;

  // 6. Write Initial Active Property Interpolation Slots
  const propSlotsView = new DataView(buffer, offset, activePropsByteSize);
  for (let i = 0; i < uniqueProperties.length; i++) {
    const propName = uniqueProperties[i];
    if (!propName) continue;
    const slotOffset = i * ACTIVE_PROP_SLOT_SIZE;
    const propIdx = stringTable.getOrAdd(propName);

    // Find first keyframe for initial value
    const initialKf = sortedKeyframes.find((k) => k.property === propName);

    propSlotsView.setInt32(slotOffset, propIdx, true);
    if (initialKf && typeof initialKf.value === "string") {
      propSlotsView.setInt32(slotOffset + 4, KeyframeValueType.String, true);
      const strValIdx = stringTable.getOrAdd(initialKf.value);
      propSlotsView.setInt32(slotOffset + 8, strValIdx, true);
      propSlotsView.setInt32(slotOffset + 12, 0, true); // lastUpdatedTick
      propSlotsView.setFloat64(slotOffset + 16, 0, true);
    } else {
      propSlotsView.setInt32(slotOffset + 4, KeyframeValueType.Numeric, true);
      propSlotsView.setInt32(slotOffset + 8, -1, true);
      propSlotsView.setInt32(slotOffset + 12, 0, true); // lastUpdatedTick
      const initialNum =
        initialKf && typeof initialKf.value === "number" ? initialKf.value : 0;
      propSlotsView.setFloat64(slotOffset + 16, initialNum, true);
    }
  }

  return { buffer, stringTable };
}

export function decodeBinaryTimeline(buffer: SharedArrayBuffer): {
  keyframes: KeyframeData[];
  stringTable: StringTable;
  durationSeconds: number;
} {
  const int32View = new Int32Array(buffer);
  const magic = int32View[HEADER_IDX_MAGIC];
  if (magic !== HEADER_MAGIC) {
    throw new Error(
      `Invalid binary timeline magic number: 0x${magic?.toString(16)}`,
    );
  }

  const durationUs = int32View[HEADER_IDX_DURATION_US] ?? 0;
  const keyframeCount = int32View[HEADER_IDX_KEYFRAME_COUNT] ?? 0;
  const stringCount = int32View[HEADER_IDX_STRING_TABLE_ENTRIES] ?? 0;
  const stringBytesCount = int32View[HEADER_IDX_STRING_TABLE_BYTES] ?? 0;

  let offset = HEADER_BYTE_SIZE;

  // Decode String Table
  const indexTableByteSize = Math.ceil((stringCount * 8) / 8) * 8;
  const stringBytesAlignedSize = Math.ceil(stringBytesCount / 8) * 8;

  const indexTable = new Int32Array(buffer, offset, stringCount * 2);
  offset += indexTableByteSize;

  const byteBuffer = new Uint8Array(buffer, offset, stringBytesCount);
  offset += stringBytesAlignedSize;

  const stringTable = StringTable.decodeFromBinary(
    stringCount,
    indexTable,
    byteBuffer,
  );

  // Decode Keyframes
  const keyframesByteSize = keyframeCount * KEYFRAME_BINARY_SIZE;
  const kfDataView = new DataView(buffer, offset, keyframesByteSize);
  const keyframes: KeyframeData[] = [];

  for (let i = 0; i < keyframeCount; i++) {
    const kfOffset = i * KEYFRAME_BINARY_SIZE;
    const timeUs = kfDataView.getInt32(kfOffset, true);
    const propIdx = kfDataView.getInt32(kfOffset + 4, true);
    const valueType = kfDataView.getInt32(kfOffset + 8, true);
    const easingIdx = kfDataView.getInt32(kfOffset + 12, true);

    const property = stringTable.getString(propIdx) ?? "";
    const easing =
      easingIdx >= 0 ? stringTable.getString(easingIdx) : undefined;

    let value: number | string;
    if (valueType === KeyframeValueType.Numeric) {
      value = kfDataView.getFloat64(kfOffset + 16, true);
    } else {
      const strValIdx = kfDataView.getInt32(kfOffset + 24, true);
      value = stringTable.getString(strValIdx) ?? "";
    }

    keyframes.push({
      time: timeUs / 1_000_000,
      property,
      value,
      ...(easing ? { easing } : {}),
    });
  }

  return {
    keyframes,
    stringTable,
    durationSeconds: durationUs / 1_000_000,
  };
}

export const BinaryTimelineEncoder = {
  encodeToSharedBuffer: encodeBinaryTimeline,
};

export const BinaryTimelineDecoder = {
  decodeFromBuffer: decodeBinaryTimeline,
};

import { describe, expect, it } from "vitest";
import {
  BinaryTimelineDecoder,
  BinaryTimelineEncoder,
} from "./binary-timeline.js";
import { SharedMemoryClock } from "./clock.js";
import { AtomicMotionHandle } from "./handle.js";
import {
  type KeyframeData,
  KeyframeValueType,
  PlaybackState,
} from "./layout.js";
import { StringTable } from "./string-table.js";

describe("Shared Memory Clock and Binary Motion Sync", () => {
  it("encodes and decodes non-numeric keyframe properties into string table lookup buffers", () => {
    const stringTable = new StringTable();
    const hexColorIdx = stringTable.getOrAdd("#FF0000");
    const svgPathIdx = stringTable.getOrAdd("M 0 0 L 100 100 Z");
    const propNameIdx = stringTable.getOrAdd("path");

    expect(hexColorIdx).toBeGreaterThanOrEqual(0);
    expect(svgPathIdx).toBeGreaterThan(hexColorIdx);
    expect(stringTable.getString(hexColorIdx)).toBe("#FF0000");
    expect(stringTable.getString(svgPathIdx)).toBe("M 0 0 L 100 100 Z");

    // Binary round-trip
    const { indexTable, byteBuffer } = stringTable.encodeToBinary();
    const decodedTable = StringTable.decodeFromBinary(
      stringTable.count,
      indexTable,
      byteBuffer,
    );

    expect(decodedTable.getString(hexColorIdx)).toBe("#FF0000");
    expect(decodedTable.getString(svgPathIdx)).toBe("M 0 0 L 100 100 Z");
    expect(decodedTable.getString(propNameIdx)).toBe("path");
  });

  it("maintains JSON backward compatibility with binary keyframe timeline encoding", () => {
    const originalKeyframes: KeyframeData[] = [
      { time: 0, property: "x", value: 0, easing: "ease-in" },
      { time: 1, property: "x", value: 100, easing: "ease-out" },
      { time: 0, property: "fill", value: "#0000FF" },
      { time: 1.5, property: "fill", value: "#FF0000" },
      { time: 0, property: "d", value: "M 0 0 L 10 10" },
    ];

    const { buffer } = BinaryTimelineEncoder.encodeToSharedBuffer(
      originalKeyframes,
      2.0,
    );
    const decoded = BinaryTimelineDecoder.decodeFromBuffer(buffer);

    expect(decoded.durationSeconds).toBe(2.0);
    expect(decoded.keyframes.length).toBe(originalKeyframes.length);

    // Verify keyframe properties match JSON
    const kfX0 = decoded.keyframes.find(
      (k) => k.property === "x" && k.time === 0,
    );
    expect(kfX0?.value).toBe(0);
    expect(kfX0?.easing).toBe("ease-in");

    const kfFill1 = decoded.keyframes.find(
      (k) => k.property === "fill" && k.time === 1.5,
    );
    expect(kfFill1?.value).toBe("#FF0000");
  });

  it("updates playhead position and active motion states directly in SharedArrayBuffer without postMessage", () => {
    const keyframes: KeyframeData[] = [
      { time: 0, property: "x", value: 0, easing: "ease-in" },
      { time: 1, property: "x", value: 100 },
      { time: 0, property: "opacity", value: 0 },
      { time: 2, property: "opacity", value: 1.0 },
      { time: 0, property: "color", value: "#000000" },
      { time: 1, property: "color", value: "#FFFFFF" },
    ];

    const { buffer } = BinaryTimelineEncoder.encodeToSharedBuffer(
      keyframes,
      2.0,
    );

    const clock = new SharedMemoryClock(buffer);
    const readerHandle = new AtomicMotionHandle(buffer);

    // Initial state check
    expect(readerHandle.playbackState).toBe(PlaybackState.Stopped);
    expect(readerHandle.playheadTimeSeconds).toBe(0);

    // Set playing and tick clock
    clock.play();
    expect(readerHandle.playbackState).toBe(PlaybackState.Playing);

    // Advance clock by 0.5 seconds
    clock.tick(0.5);

    // Reader reads updated playhead and interpolated states atomically
    expect(readerHandle.playheadTimeSeconds).toBe(0.5);
    expect(readerHandle.tickCount).toBe(1);

    const xState = readerHandle.getPropertyState("x");
    expect(xState).toBeDefined();
    expect(xState?.valueType).toBe(KeyframeValueType.Numeric);
    // At t=0.5 with ease-in (t*t = 0.25), expected x = 0 + 0.25 * 100 = 25
    expect(xState?.value).toBeCloseTo(25, 2);

    const opacityState = readerHandle.getPropertyState("opacity");
    expect(opacityState?.value).toBeCloseTo(0.25, 2);

    const colorState = readerHandle.getPropertyState("color");
    expect(colorState?.value).toBe("#000000"); // Step transition before t=1.0

    // Advance clock to t=1.0
    clock.tick(0.5);
    expect(readerHandle.playheadTimeSeconds).toBe(1.0);
    expect(readerHandle.getPropertyState("x")?.value).toBeCloseTo(100, 2);
    expect(readerHandle.getPropertyState("color")?.value).toBe("#FFFFFF");
  });

  it("handles high-density timelines exceeding 10,000 keyframes without frame drift", () => {
    const keyframes: KeyframeData[] = [];
    const keyframeCount = 10_000;

    for (let i = 0; i < keyframeCount; i++) {
      keyframes.push({
        time: (i / keyframeCount) * 10,
        property: i % 2 === 0 ? "x" : "y",
        value: i * 0.5,
      });
    }

    const { buffer } = BinaryTimelineEncoder.encodeToSharedBuffer(
      keyframes,
      10.0,
    );
    const clock = new SharedMemoryClock(buffer);
    const handle = new AtomicMotionHandle(buffer);

    clock.play();

    // Perform 100 clock ticks
    const startTime = performance.now();
    for (let t = 0; t < 100; t++) {
      clock.tick(0.016); // ~60 FPS tick
    }
    const elapsed = performance.now() - startTime;

    expect(handle.playheadTimeSeconds).toBeCloseTo(1.6, 2);
    expect(handle.tickCount).toBe(100);
    expect(elapsed).toBeLessThan(1000); // Super fast execution
  });
});

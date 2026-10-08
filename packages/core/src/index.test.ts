import { expect, test } from "vitest";
import {
  AnimationEngine,
  type AnimationEvent,
  AnimationEventBus,
  CORE_VERSION,
  type SceneDocument,
} from "./index.js";

test("core version is defined", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});

test("AnimationEventBus emits and receives RETIME and TRIM events", () => {
  const bus = new AnimationEventBus("bus-1");
  const receivedEvents: AnimationEvent[] = [];

  bus.subscribe((event) => {
    receivedEvents.push(event);
  });

  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "opacity",
    keyframeIndex: 0,
    oldTime: 1.0,
    newTime: 2.5,
    sequenceId: 100,
  });

  bus.publish({
    type: "LAYER_TRIM",
    layerId: "layer-1",
    trimIn: 0.5,
    trimOut: 4.0,
    sequenceId: 101,
  });

  expect(receivedEvents.length).toBe(2);
  const first = receivedEvents[0];
  const second = receivedEvents[1];
  expect(first?.type).toBe("ANIMATION_RETIME");
  expect(first?.senderId).toBe("bus-1");
  expect(second?.type).toBe("LAYER_TRIM");
  if (second?.type === "LAYER_TRIM") {
    expect(second.trimOut).toBe(4.0);
  }
});

test("AnimationEngine reconfigures keyframe tracks and trims via event bus", () => {
  const bus = new AnimationEventBus("bus-test");
  const engine = new AnimationEngine(bus);

  // Set initial track keyframes
  engine.setTrack("layer-1", "position", [
    { t: 0, v: [0, 0] },
    { t: 2, v: [100, 100] },
  ]);

  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "position",
    keyframeIndex: 1,
    oldTime: 2.0,
    newTime: 3.5,
    sequenceId: 200,
  });

  const track = engine.getTrack("layer-1", "position");
  expect(track).toBeDefined();
  expect(track?.keyframes[1]?.t).toBe(3.5);

  bus.publish({
    type: "LAYER_TRIM",
    layerId: "layer-1",
    trimIn: 1.0,
    trimOut: 8.0,
    sequenceId: 201,
  });

  const trim = engine.getLayerTrim("layer-1");
  expect(trim.trimIn).toBe(1.0);
  expect(trim.trimOut).toBe(8.0);
});

test("AnimationEngine drops out-of-order network messages during fast drags", () => {
  const bus = new AnimationEventBus("bus-seq");
  const engine = new AnimationEngine(bus);

  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "position",
    keyframeIndex: 0,
    newTime: 2.0,
    sequenceId: 1000,
  });

  // Out-of-order event with lower sequenceId
  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "position",
    keyframeIndex: 0,
    newTime: 1.0,
    sequenceId: 900,
  });

  const track = engine.getTrack("layer-1", "position");
  expect(track?.keyframes[0]?.t).toBe(2.0); // Kept 2.0, dropped 1.0
});

test("AnimationEngine prevents corrupt keyframe arrays and invalid trim bounds", () => {
  const bus = new AnimationEventBus("bus-valid");
  const engine = new AnimationEngine(bus);

  // Invalid negative keyframe time
  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "position",
    keyframeIndex: 0,
    newTime: -5.0,
    sequenceId: 10,
  });

  expect(engine.getTrack("layer-1", "position")).toBeUndefined();

  // Invalid trim bounds (trimIn >= trimOut)
  bus.publish({
    type: "LAYER_TRIM",
    layerId: "layer-1",
    trimIn: 5.0,
    trimOut: 3.0,
    sequenceId: 11,
  });

  expect(engine.getLayerTrim("layer-1")).toEqual({
    layerId: "layer-1",
    trimIn: 0,
    trimOut: 10,
  });
});

test("AnimationEngine writes retiming changes to scene document on save", () => {
  const bus = new AnimationEventBus("bus-save");
  const sceneDoc: SceneDocument = { id: "doc-1", name: "My Scene" };
  const engine = new AnimationEngine(bus, sceneDoc);

  bus.publish({
    type: "ANIMATION_RETIME",
    layerId: "layer-1",
    prop: "scale",
    keyframeIndex: 0,
    newTime: 1.25,
    sequenceId: 50,
  });

  const saved = engine.saveProject();
  expect(saved).not.toBeNull();
  expect(saved?.retiming).toBeDefined();
  const trackKeyframes = saved?.retiming?.tracks["layer-1:scale"];
  expect(trackKeyframes).toBeDefined();
  expect(trackKeyframes?.[0]?.t).toBe(1.25);
});

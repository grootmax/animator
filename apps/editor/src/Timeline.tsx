import type { AnimationEngine, AnimationEventBus } from "@animator/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TimelineLayer {
  id: string;
  name: string;
}

export interface TimelineProps {
  eventBus: AnimationEventBus;
  engine: AnimationEngine;
  layers?: TimelineLayer[];
  pixelsPerSecond?: number;
  duration?: number;
}

const DEFAULT_LAYERS: TimelineLayer[] = [
  { id: "layer-1", name: "Layer 1" },
  { id: "layer-2", name: "Layer 2" },
];

export function Timeline({
  eventBus,
  engine,
  layers = DEFAULT_LAYERS,
  pixelsPerSecond = 50,
  duration = 10,
}: TimelineProps) {
  // Force update trigger on event bus changes
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const unsubscribe = eventBus.subscribe(() => {
      forceUpdate();
    });
    return () => {
      unsubscribe();
    };
  }, [eventBus, forceUpdate]);

  // Drag state refs
  const dragRef = useRef<{
    type: "keyframe" | "trimIn" | "trimOut";
    layerId: string;
    prop?: string;
    keyframeIndex?: number;
    startX: number;
    initialTime?: number;
    initialTrimIn?: number;
    initialTrimOut?: number;
  } | null>(null);

  const handlePointerDownKeyframe = (
    e: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    prop: string,
    keyframeIndex: number,
    initialTime: number,
  ) => {
    e.stopPropagation();
    const target = e.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback in test environments
      }
    }

    dragRef.current = {
      type: "keyframe",
      layerId,
      prop,
      keyframeIndex,
      startX: e.clientX,
      initialTime,
    };
  };

  const handlePointerDownTrim = (
    e: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    type: "trimIn" | "trimOut",
    initialTrimIn: number,
    initialTrimOut: number,
  ) => {
    e.stopPropagation();
    const target = e.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    }

    dragRef.current = {
      type,
      layerId,
      startX: e.clientX,
      initialTrimIn,
      initialTrimOut,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaX = e.clientX - drag.startX;
    const deltaTime = deltaX / pixelsPerSecond;
    const seqId = Date.now();

    if (drag.type === "keyframe") {
      if (
        drag.initialTime !== undefined &&
        drag.prop !== undefined &&
        drag.keyframeIndex !== undefined
      ) {
        const newTime = Math.max(0, drag.initialTime + deltaTime);
        eventBus.publish({
          type: "ANIMATION_RETIME",
          layerId: drag.layerId,
          prop: drag.prop,
          keyframeIndex: drag.keyframeIndex,
          oldTime: drag.initialTime,
          newTime,
          sequenceId: seqId,
        });
      }
    } else if (drag.type === "trimIn") {
      if (
        drag.initialTrimIn !== undefined &&
        drag.initialTrimOut !== undefined
      ) {
        const newTrimIn = Math.max(0, drag.initialTrimIn + deltaTime);
        if (newTrimIn < drag.initialTrimOut) {
          eventBus.publish({
            type: "LAYER_TRIM",
            layerId: drag.layerId,
            trimIn: newTrimIn,
            trimOut: drag.initialTrimOut,
            sequenceId: seqId,
          });
        }
      }
    } else if (drag.type === "trimOut") {
      if (
        drag.initialTrimIn !== undefined &&
        drag.initialTrimOut !== undefined
      ) {
        const newTrimOut = Math.max(0, drag.initialTrimOut + deltaTime);
        if (newTrimOut > drag.initialTrimIn) {
          eventBus.publish({
            type: "LAYER_TRIM",
            layerId: drag.layerId,
            trimIn: drag.initialTrimIn,
            trimOut: newTrimOut,
            sequenceId: seqId,
          });
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const target = e.currentTarget;
      if (typeof target.releasePointerCapture === "function") {
        try {
          target.releasePointerCapture(e.pointerId);
        } catch {
          // Safe fallback
        }
      }
      dragRef.current = null;
    }
  };

  return (
    <div
      className="timeline-container"
      data-testid="timeline"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        width: "100%",
        padding: "16px",
        boxSizing: "border-box",
        userSelect: "none",
        fontFamily: "sans-serif",
      }}
    >
      <div
        className="timeline-ruler"
        data-testid="timeline-ruler"
        style={{
          display: "flex",
          borderBottom: "1px solid #ccc",
          paddingBottom: "8px",
          marginBottom: "12px",
          position: "relative",
          height: "24px",
        }}
      >
        {Array.from({ length: duration + 1 }, (_, i) => i).map((sec) => (
          <div
            key={`ruler-mark-${sec}`}
            style={{
              position: "absolute",
              left: `${sec * pixelsPerSecond}px`,
              fontSize: "12px",
              color: "#666",
            }}
          >
            {sec}s
          </div>
        ))}
      </div>

      <div
        className="timeline-layers"
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        {layers.map((layer) => {
          const trim = engine.getLayerTrim(layer.id);
          const track = engine.getTrack(layer.id, "position") || {
            id: `${layer.id}:position`,
            layerId: layer.id,
            prop: "position",
            keyframes: [
              { t: 0, v: 0 },
              { t: 2, v: 100 },
            ],
          };

          const barLeft = trim.trimIn * pixelsPerSecond;
          const barWidth = Math.max(
            10,
            (trim.trimOut - trim.trimIn) * pixelsPerSecond,
          );

          return (
            <div
              key={layer.id}
              className="timeline-layer-row"
              data-testid={`layer-row-${layer.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                height: "36px",
                position: "relative",
              }}
            >
              <div
                className="layer-label"
                style={{
                  width: "100px",
                  fontWeight: "bold",
                  fontSize: "14px",
                }}
              >
                {layer.name}
              </div>

              <div
                className="track-lane"
                style={{
                  position: "relative",
                  flex: 1,
                  height: "100%",
                  backgroundColor: "#f4f4f4",
                  borderRadius: "4px",
                  overflow: "visible",
                }}
              >
                {/* Layer duration bar */}
                <div
                  className="layer-duration-bar"
                  data-testid={`layer-bar-${layer.id}`}
                  style={{
                    position: "absolute",
                    left: `${barLeft}px`,
                    width: `${barWidth}px`,
                    height: "100%",
                    backgroundColor: "#e0e7ff",
                    border: "1px solid #818cf8",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  {/* Trim In handle (Left) */}
                  <div
                    className="trim-handle trim-handle-in"
                    data-testid={`trim-handle-in-${layer.id}`}
                    onPointerDown={(e) =>
                      handlePointerDownTrim(
                        e,
                        layer.id,
                        "trimIn",
                        trim.trimIn,
                        trim.trimOut,
                      )
                    }
                    style={{
                      position: "absolute",
                      left: "0px",
                      top: "0px",
                      width: "8px",
                      height: "100%",
                      backgroundColor: "#4f46e5",
                      cursor: "col-resize",
                      borderTopLeftRadius: "3px",
                      borderBottomLeftRadius: "3px",
                    }}
                  />

                  {/* Trim Out handle (Right) */}
                  <div
                    className="trim-handle trim-handle-out"
                    data-testid={`trim-handle-out-${layer.id}`}
                    onPointerDown={(e) =>
                      handlePointerDownTrim(
                        e,
                        layer.id,
                        "trimOut",
                        trim.trimIn,
                        trim.trimOut,
                      )
                    }
                    style={{
                      position: "absolute",
                      right: "0px",
                      top: "0px",
                      width: "8px",
                      height: "100%",
                      backgroundColor: "#4f46e5",
                      cursor: "col-resize",
                      borderTopRightRadius: "3px",
                      borderBottomRightRadius: "3px",
                    }}
                  />
                </div>

                {/* Keyframe diamonds */}
                {track.keyframes.map((kf, index) => {
                  const kfLeft = kf.t * pixelsPerSecond;
                  return (
                    <div
                      key={`kf-${layer.id}-${index}`}
                      className="keyframe-diamond"
                      data-testid={`keyframe-diamond-${layer.id}-${index}`}
                      onPointerDown={(e) =>
                        handlePointerDownKeyframe(
                          e,
                          layer.id,
                          track.prop,
                          index,
                          kf.t,
                        )
                      }
                      style={{
                        position: "absolute",
                        left: `${kfLeft}px`,
                        top: "50%",
                        width: "12px",
                        height: "12px",
                        backgroundColor: "#ef4444",
                        transform: "translate(-50%, -50%) rotate(45deg)",
                        cursor: "grab",
                        zIndex: 10,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import type React from "react";
import { useRef, useState } from "react";
import {
  alignToFrameInterval,
  useSceneGraphStore,
} from "../store/sceneGraphStore.js";

interface TimelineProps {
  pxPerSecond?: number;
}

type DragState =
  | {
      type: "keyframe";
      layerId: string;
      prop: string;
      keyframeIndex: number;
      initialX: number;
      initialTime: number;
      pointerId: number;
      targetElement: HTMLElement;
    }
  | {
      type: "layerIn";
      layerId: string;
      initialX: number;
      initialIn: number;
      initialOut: number;
      pointerId: number;
      targetElement: HTMLElement;
    }
  | {
      type: "layerOut";
      layerId: string;
      initialX: number;
      initialIn: number;
      initialOut: number;
      pointerId: number;
      targetElement: HTMLElement;
    }
  | null;

export const Timeline: React.FC<TimelineProps> = ({ pxPerSecond = 100 }) => {
  const document = useSceneGraphStore((s) => s.document);
  const playheadTime = useSceneGraphStore((s) => s.playheadTime);
  const setPlayheadTime = useSceneGraphStore((s) => s.setPlayheadTime);
  const updateKeyframeTime = useSceneGraphStore((s) => s.updateKeyframeTime);
  const updateLayerDuration = useSceneGraphStore((s) => s.updateLayerDuration);

  const [dragState, setDragState] = useState<DragState>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const fps = document.canvas?.fps || 60;
  const totalDuration = document.canvas?.duration || 4;
  const totalWidth = totalDuration * pxPerSecond;

  const handleKeyframePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    prop: string,
    keyframeIndex: number,
    initialTime: number,
  ) => {
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.setPointerCapture(e.pointerId);

    setDragState({
      type: "keyframe",
      layerId,
      prop,
      keyframeIndex,
      initialX: e.clientX,
      initialTime,
      pointerId: e.pointerId,
      targetElement,
    });
  };

  const handleLayerInPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    initialIn: number,
    initialOut: number,
  ) => {
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.setPointerCapture(e.pointerId);

    setDragState({
      type: "layerIn",
      layerId,
      initialX: e.clientX,
      initialIn,
      initialOut,
      pointerId: e.pointerId,
      targetElement,
    });
  };

  const handleLayerOutPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    initialIn: number,
    initialOut: number,
  ) => {
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.setPointerCapture(e.pointerId);

    setDragState({
      type: "layerOut",
      layerId,
      initialX: e.clientX,
      initialIn,
      initialOut,
      pointerId: e.pointerId,
      targetElement,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    const deltaX = e.clientX - dragState.initialX;
    const deltaTime = deltaX / pxPerSecond;

    if (dragState.type === "keyframe") {
      const unalignedNewTime = Math.max(0, dragState.initialTime + deltaTime);
      const alignedTime = alignToFrameInterval(unalignedNewTime, fps);
      // Update playhead preview in real time during drag
      setPlayheadTime(alignedTime);
    } else if (dragState.type === "layerIn") {
      const unalignedIn = Math.max(0, dragState.initialIn + deltaTime);
      const alignedIn = alignToFrameInterval(unalignedIn, fps);
      const cappedIn = Math.min(alignedIn, dragState.initialOut);
      setPlayheadTime(cappedIn);
    } else if (dragState.type === "layerOut") {
      const unalignedOut = Math.max(
        dragState.initialIn,
        dragState.initialOut + deltaTime,
      );
      const alignedOut = alignToFrameInterval(unalignedOut, fps);
      setPlayheadTime(alignedOut);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    const deltaX = e.clientX - dragState.initialX;
    const deltaTime = deltaX / pxPerSecond;

    try {
      if (dragState.targetElement.hasPointerCapture(dragState.pointerId)) {
        dragState.targetElement.releasePointerCapture(dragState.pointerId);
      }
    } catch {
      // Ignore if capture was lost
    }

    if (dragState.type === "keyframe") {
      const unalignedNewTime = Math.max(0, dragState.initialTime + deltaTime);
      const alignedTime = alignToFrameInterval(unalignedNewTime, fps);
      updateKeyframeTime(
        dragState.layerId,
        dragState.prop,
        dragState.keyframeIndex,
        alignedTime,
      );
    } else if (dragState.type === "layerIn") {
      const unalignedIn = Math.max(0, dragState.initialIn + deltaTime);
      const alignedIn = alignToFrameInterval(unalignedIn, fps);
      updateLayerDuration(dragState.layerId, {
        inTime: alignedIn,
        outTime: dragState.initialOut,
      });
    } else if (dragState.type === "layerOut") {
      const unalignedOut = Math.max(
        dragState.initialIn,
        dragState.initialOut + deltaTime,
      );
      const alignedOut = alignToFrameInterval(unalignedOut, fps);
      updateLayerDuration(dragState.layerId, {
        inTime: dragState.initialIn,
        outTime: alignedOut,
      });
    }

    setDragState(null);
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const time = Math.max(0, clickX / pxPerSecond);
    const alignedTime = alignToFrameInterval(time, fps);
    setPlayheadTime(alignedTime);
  };

  return (
    <div
      ref={timelineRef}
      className="timeline-container"
      data-testid="timeline"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "relative",
        userSelect: "none",
        width: `${totalWidth}px`,
        backgroundColor: "#1e1e24",
        color: "#ffffff",
        fontFamily: "sans-serif",
        padding: "10px",
      }}
    >
      {/* Time Ruler */}
      <div
        className="timeline-ruler"
        data-testid="timeline-ruler"
        onPointerDown={handleRulerPointerDown}
        style={{
          height: "30px",
          backgroundColor: "#2a2a32",
          position: "relative",
          cursor: "pointer",
          borderBottom: "1px solid #444",
        }}
      >
        {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => i).map(
          (secondVal) => (
            <div
              key={`tick-${secondVal}`}
              style={{
                position: "absolute",
                left: `${secondVal * pxPerSecond}px`,
                top: 0,
                bottom: 0,
                borderLeft: "1px solid #666",
                paddingLeft: "4px",
                fontSize: "10px",
                color: "#aaa",
              }}
            >
              {secondVal}s
            </div>
          ),
        )}
      </div>

      {/* Playhead Line */}
      <div
        className="timeline-playhead"
        data-testid="timeline-playhead"
        style={{
          position: "absolute",
          top: "10px",
          bottom: "10px",
          left: `${playheadTime * pxPerSecond + 10}px`,
          width: "2px",
          backgroundColor: "#ff5a5f",
          zIndex: 10,
          pointerEvents: "none",
        }}
      />

      {/* Layer Tracks */}
      <div className="timeline-tracks" style={{ marginTop: "10px" }}>
        {document.layers.map((layer) => (
          <div
            key={layer.id}
            data-testid={`layer-track-${layer.id}`}
            style={{
              marginBottom: "15px",
              borderBottom: "1px solid #333",
              paddingBottom: "10px",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: "12px",
                marginBottom: "4px",
              }}
            >
              {layer.name} ({layer.in.toFixed(2)}s - {layer.out.toFixed(2)}s)
            </div>

            {/* Duration Bar */}
            <div
              style={{
                position: "relative",
                height: "24px",
                backgroundColor: "#2d3748",
                borderRadius: "4px",
                width: `${totalWidth}px`,
              }}
            >
              <div
                className="layer-duration-bar"
                data-testid={`layer-bar-${layer.id}`}
                style={{
                  position: "absolute",
                  left: `${layer.in * pxPerSecond}px`,
                  width: `${Math.max(2, (layer.out - layer.in) * pxPerSecond)}px`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "#4a5568",
                  borderRadius: "2px",
                }}
              >
                {/* In Handle */}
                <div
                  className="layer-in-handle"
                  data-testid={`layer-in-handle-${layer.id}`}
                  onPointerDown={(e) =>
                    handleLayerInPointerDown(e, layer.id, layer.in, layer.out)
                  }
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "8px",
                    backgroundColor: "#3182ce",
                    cursor: "ew-resize",
                    borderRadius: "2px 0 0 2px",
                  }}
                />

                {/* Out Handle */}
                <div
                  className="layer-out-handle"
                  data-testid={`layer-out-handle-${layer.id}`}
                  onPointerDown={(e) =>
                    handleLayerOutPointerDown(e, layer.id, layer.in, layer.out)
                  }
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: "8px",
                    backgroundColor: "#3182ce",
                    cursor: "ew-resize",
                    borderRadius: "0 2px 2px 0",
                  }}
                />
              </div>
            </div>

            {/* Keyframe Rows */}
            <div style={{ marginTop: "6px" }}>
              {Object.entries(layer.tracks || {}).map(([prop, track]) => (
                <div
                  key={prop}
                  style={{
                    position: "relative",
                    height: "20px",
                    backgroundColor: "#1a202c",
                    marginTop: "2px",
                    width: `${totalWidth}px`,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: "4px",
                      top: "2px",
                      fontSize: "10px",
                      color: "#888",
                    }}
                  >
                    {prop}
                  </span>

                  {track.keyframes.map((kf, index) => (
                    <div
                      key={`kf-${prop}-${kf.t}-${index}`}
                      className="keyframe-handle"
                      data-testid={`keyframe-${layer.id}-${prop}-${index}`}
                      onPointerDown={(e) =>
                        handleKeyframePointerDown(
                          e,
                          layer.id,
                          prop,
                          index,
                          kf.t,
                        )
                      }
                      style={{
                        position: "absolute",
                        left: `${kf.t * pxPerSecond - 6}px`,
                        top: "4px",
                        width: "12px",
                        height: "12px",
                        backgroundColor: "#ecc94b",
                        transform: "rotate(45deg)",
                        cursor: "grab",
                        zIndex: 5,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

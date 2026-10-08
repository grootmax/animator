import {
  CanvasKitBridge,
  type SceneNode,
  type ViewportTransform,
} from "@animator/render";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export interface EditorCanvasProps {
  initialNodes?: SceneNode[];
  width?: number;
  height?: number;
}

export function EditorCanvas({
  initialNodes,
  width = 800,
  height = 600,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bridgeRef = useRef<CanvasKitBridge | null>(null);

  const [nodes, setNodes] = useState<SceneNode[]>(
    initialNodes || [
      {
        id: "node-rect-1",
        type: "rectangle",
        x: 150,
        y: 150,
        width: 160,
        height: 100,
        fill: "#FF5A5F",
        strokeColor: "#FFFFFF",
        strokeWidth: 3,
        cornerRadius: 12,
      },
      {
        id: "node-circle-1",
        type: "circle",
        x: 450,
        y: 200,
        radius: 60,
        fill: "#00E676",
        strokeColor: "#000000",
        strokeWidth: 2,
      },
      {
        id: "node-ellipse-1",
        type: "ellipse",
        x: 200,
        y: 380,
        radiusX: 70,
        radiusY: 45,
        fill: "#3D5AFE",
        strokeColor: "#FFFFFF",
        strokeWidth: 2,
      },
      {
        id: "node-path-1",
        type: "path",
        x: 400,
        y: 320,
        d: "M 0 0 L 80 -40 L 120 40 L 40 80 Z",
        fill: "#FFD600",
        strokeColor: "#333333",
        strokeWidth: 3,
      },
      {
        id: "node-line-1",
        type: "line",
        x: 0,
        y: 0,
        x1: 100,
        y1: 500,
        x2: 700,
        y2: 500,
        strokeColor: "#FF9100",
        strokeWidth: 5,
      },
    ],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "node-rect-1",
  );
  const [viewport, setViewport] = useState<ViewportTransform>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });

  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Initialize CanvasKit surface on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount initialization
  useEffect(() => {
    let active = true;

    async function initCanvas() {
      const bridge = await CanvasKitBridge.create();
      if (!active) return;
      bridgeRef.current = bridge;

      if (canvasRef.current) {
        bridge.bindSurface(canvasRef.current);
        bridge.setViewport(viewport);
        bridge.setSelectedNodeId(selectedNodeId);
        bridge.renderScene(nodes);
      }
    }

    initCanvas();

    return () => {
      active = false;
      if (bridgeRef.current) {
        bridgeRef.current.destroy();
        bridgeRef.current = null;
      }
    };
  }, []);

  // Re-render when nodes, selection, or viewport update
  useEffect(() => {
    if (bridgeRef.current && canvasRef.current) {
      bridgeRef.current.setViewport(viewport);
      bridgeRef.current.setSelectedNodeId(selectedNodeId);
      bridgeRef.current.renderScene(nodes);
    }
  }, [nodes, selectedNodeId, viewport]);

  // Handle Wheel event for Viewport Zooming
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, 0.1), 5.0);

    // Zoom centered on cursor
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newPanX =
      mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
    const newPanY =
      mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);

    setViewport({ panX: newPanX, panY: newPanY, zoom: newZoom });
  };

  // Handle Pointer Down for selection, node dragging, and viewport panning
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Middle mouse button or Shift key triggers viewport panning
    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setDragStart({ x: mouseX, y: mouseY });
      return;
    }

    // Convert screen coordinates to scene space
    const scenePt = bridgeRef.current
      ? bridgeRef.current.screenToScene(mouseX, mouseY)
      : {
          x: (mouseX - viewport.panX) / viewport.zoom,
          y: (mouseY - viewport.panY) / viewport.zoom,
        };

    // Check hit testing against nodes
    let hitId: string | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node) continue;
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const bounds = bridgeRef.current
        ? bridgeRef.current.calculateNodeBounds(node)
        : { x: 0, y: 0, width: 100, height: 100 };

      if (
        scenePt.x >= nx + bounds.x &&
        scenePt.x <= nx + bounds.x + bounds.width &&
        scenePt.y >= ny + bounds.y &&
        scenePt.y <= ny + bounds.y + bounds.height
      ) {
        hitId = node.id;
        break;
      }
    }

    setSelectedNodeId(hitId);
    if (hitId) {
      setDraggingNodeId(hitId);
      setDragStart({ x: mouseX, y: mouseY });
    }
  };

  // Handle Pointer Move for dragging node or panning viewport
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isPanning) {
      const dx = mouseX - dragStart.x;
      const dy = mouseY - dragStart.y;
      setViewport((prev: ViewportTransform) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      setDragStart({ x: mouseX, y: mouseY });
      return;
    }

    if (draggingNodeId) {
      const dx = (mouseX - dragStart.x) / viewport.zoom;
      const dy = (mouseY - dragStart.y) / viewport.zoom;

      setNodes((prevNodes) =>
        prevNodes.map((n) =>
          n.id === draggingNodeId
            ? { ...n, x: (n.x ?? 0) + dx, y: (n.y ?? 0) + dy }
            : n,
        ),
      );
      setDragStart({ x: mouseX, y: mouseY });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <span>
          <strong>CanvasKit Surface Engine</strong>
        </span>
        <span>Zoom: {(viewport.zoom * 100).toFixed(0)}%</span>
        <span>
          Pan: ({viewport.panX.toFixed(0)}, {viewport.panY.toFixed(0)})
        </span>
        <button
          type="button"
          onClick={() => setViewport({ panX: 0, panY: 0, zoom: 1.0 })}
        >
          Reset Viewport
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          border: "1px solid #333",
          borderRadius: "8px",
          cursor: isPanning ? "grab" : "default",
          touchAction: "none",
        }}
      />
    </div>
  );
}

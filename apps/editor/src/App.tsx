import type { Layer } from "@animator/core";
import React from "react";
import { CanvasViewport } from "./components/CanvasViewport.js";
import { LayerPanel } from "./components/LayerPanel.js";
import { RightSidebar } from "./components/RightSidebar.js";
import { Toolbar } from "./components/Toolbar.js";
import { useSceneStore } from "./store/sceneStore.js";

export function App() {
  const store = useSceneStore();
  const { doc, selectedNodeId, activeTab } = store;

  const selectedLayer =
    doc.layers.find((layer: Layer) => layer.id === selectedNodeId) || null;

  const handleAddLayer = (type: "shape" | "text") => {
    const newId = `${type}-${Date.now().toString().slice(-4)}`;
    const newLayer: Layer =
      type === "shape"
        ? {
            id: newId,
            name: `Rectangle ${newId}`,
            type: "shape",
            position: [540, 540],
            scale: [100, 100],
            rotation: 0,
            opacity: 100,
            visible: true,
            fill: "#38BDF8",
            stroke: { color: "#FFFFFF", width: 2 },
            shape: { kind: "rect", size: [200, 120], radius: 8 },
          }
        : {
            id: newId,
            name: `Text ${newId}`,
            type: "text",
            position: [540, 540],
            scale: [100, 100],
            rotation: 0,
            opacity: 100,
            visible: true,
            text: "Sample Text",
            font: { family: "Inter", weight: 700, size: 36 },
            fill: "#FFFFFF",
            align: "center",
          };

    store.applyOps([{ op: "addLayer", layer: newLayer }]);
    store.selectNode(newId);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Toolbar
        layerCount={doc.layers.length}
        paramCount={Object.keys(doc.params).length}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onUndo={store.undo}
        onRedo={store.redo}
      />
      <div className="editor-layout">
        <LayerPanel
          layers={doc.layers}
          selectedNodeId={selectedNodeId}
          onSelectNode={store.selectNode}
          onAddLayer={handleAddLayer}
        />
        <CanvasViewport
          doc={doc}
          selectedNodeId={selectedNodeId}
          onSelectNode={store.selectNode}
        />
        <RightSidebar
          activeTab={activeTab}
          onTabChange={store.setActiveTab}
          selectedLayer={selectedLayer}
          onUpdateLayer={store.updateLayer}
          params={doc.params}
          onSetParam={store.setParam}
          onAddParam={store.addParam}
          onRemoveParam={store.removeParam}
        />
      </div>
    </div>
  );
}

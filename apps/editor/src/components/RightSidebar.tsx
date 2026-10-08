import type { Layer, Param } from "@animator/core";
import React from "react";
import type { TabType } from "../store/sceneStore.js";
import { InspectorTab } from "./InspectorTab.js";
import { ParamsTab } from "./ParamsTab.js";

interface RightSidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedLayer: Layer | null;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  params: Record<string, Param>;
  onSetParam: (name: string, param: Param | null) => void;
  onAddParam: (name: string, param: Param) => void;
  onRemoveParam: (name: string) => void;
}

export function RightSidebar({
  activeTab,
  onTabChange,
  selectedLayer,
  onUpdateLayer,
  params,
  onSetParam,
  onAddParam,
  onRemoveParam,
}: RightSidebarProps) {
  return (
    <aside
      className="right-sidebar"
      style={{ width: 280, minWidth: 280, maxWidth: 280 }}
    >
      <nav className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === "inspector" ? "active" : ""}`}
          onClick={() => onTabChange("inspector")}
        >
          Inspector
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "params" ? "active" : ""}`}
          onClick={() => onTabChange("params")}
        >
          Params ({Object.keys(params).length})
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === "inspector" ? (
          <InspectorTab
            selectedLayer={selectedLayer}
            onUpdateLayer={onUpdateLayer}
          />
        ) : (
          <ParamsTab
            params={params}
            onSetParam={onSetParam}
            onAddParam={onAddParam}
            onRemoveParam={onRemoveParam}
          />
        )}
      </div>
    </aside>
  );
}

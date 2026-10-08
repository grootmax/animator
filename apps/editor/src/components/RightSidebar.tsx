import React, { useState } from "react";
import { useEditorStore } from "../context/EditorContext.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { LayerInspector } from "./LayerInspector.js";
import { ThemePanel } from "./ThemePanel.js";

export function RightSidebar() {
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const [themeExpanded, setThemeExpanded] = useState(true);

  const { doc, selectedNodeId } = useEditorStore();
  const themeParamCount = Object.keys(doc.params).length;

  return (
    <aside
      className="right-sidebar"
      data-testid="right-sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "340px",
        height: "100vh",
        maxHeight: "100vh",
        backgroundColor: "#171923",
        borderLeft: "1px solid #2d3748",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Top Section: Layer Inspector */}
      <CollapsibleSection
        title="Layer Inspector"
        isExpanded={inspectorExpanded}
        onToggle={() => setInspectorExpanded(!inspectorExpanded)}
        badge={selectedNodeId ? "1 Selected" : "0 Selected"}
      >
        <LayerInspector />
      </CollapsibleSection>

      {/* Bottom Section: Theme Parameters */}
      <CollapsibleSection
        title="Theme Parameters"
        isExpanded={themeExpanded}
        onToggle={() => setThemeExpanded(!themeExpanded)}
        badge={`${themeParamCount} Params`}
      >
        <ThemePanel />
      </CollapsibleSection>
    </aside>
  );
}

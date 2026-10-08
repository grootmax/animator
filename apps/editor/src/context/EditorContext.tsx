import type React from "react";
import { createContext, useContext, useState } from "react";
import type {
  Layer,
  LayerStyle,
  MotionDoc,
  ThemeParam,
  Transform,
} from "../types.js";

const initialDoc: MotionDoc = {
  version: 1,
  name: "Untitled Animation",
  canvas: {
    width: 1080,
    height: 1080,
    fps: 30,
    duration: 4,
    background: "#0B1020",
  },
  params: {
    accent: {
      id: "param-1",
      key: "accent",
      type: "color",
      value: "#FF5A5F",
      label: "Accent Color",
    },
    headline: {
      id: "param-2",
      key: "headline",
      type: "text",
      value: "Ship faster",
      label: "Main Headline",
    },
    speed: {
      id: "param-3",
      key: "speed",
      type: "number",
      value: 100,
      label: "Animation Speed %",
    },
  },
  layers: [
    {
      id: "title-layer",
      name: "Headline Text",
      type: "text",
      visible: true,
      transform: {
        position: [540, 480],
        scale: [100, 100],
        rotation: 0,
        opacity: 100,
      },
      style: {
        text: "{{headline}}",
        fill: "{{accent}}",
        fontSize: 72,
        fontFamily: "Inter",
      },
    },
    {
      id: "badge-layer",
      name: "Accent Badge Shape",
      type: "shape",
      visible: true,
      transform: {
        position: [540, 620],
        scale: [100, 100],
        rotation: 0,
        opacity: 90,
      },
      style: {
        size: [240, 64],
        fill: "#2A2E3D",
        stroke: {
          color: "{{accent}}",
          width: 3,
        },
      },
    },
  ],
};

interface EditorContextType {
  doc: MotionDoc;
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;
  updateTransform: (layerId: string, updates: Partial<Transform>) => void;
  updateStyle: (layerId: string, updates: Partial<LayerStyle>) => void;
  updateLayerName: (layerId: string, name: string) => void;
  updateThemeParam: (key: string, value: string | number) => void;
  addThemeParam: (param: ThemeParam) => void;
  removeThemeParam: (key: string) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<MotionDoc>(initialDoc);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    "title-layer",
  );

  const selectNode = (id: string | null) => {
    setSelectedNodeId(id);
  };

  const updateTransform = (layerId: string, updates: Partial<Transform>) => {
    setDoc((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, transform: { ...layer.transform, ...updates } }
          : layer,
      ),
    }));
  };

  const updateStyle = (layerId: string, updates: Partial<LayerStyle>) => {
    setDoc((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, style: { ...layer.style, ...updates } }
          : layer,
      ),
    }));
  };

  const updateLayerName = (layerId: string, name: string) => {
    setDoc((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId ? { ...layer, name } : layer,
      ),
    }));
  };

  const updateThemeParam = (key: string, value: string | number) => {
    setDoc((prev) => {
      const existing = prev.params[key];
      if (!existing) return prev;
      return {
        ...prev,
        params: {
          ...prev.params,
          [key]: {
            ...existing,
            value,
          },
        },
      };
    });
  };

  const addThemeParam = (param: ThemeParam) => {
    setDoc((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        [param.key]: param,
      },
    }));
  };

  const removeThemeParam = (key: string) => {
    setDoc((prev) => {
      const nextParams = { ...prev.params };
      delete nextParams[key];
      return {
        ...prev,
        params: nextParams,
      };
    });
  };

  return (
    <EditorContext.Provider
      value={{
        doc,
        selectedNodeId,
        selectNode,
        updateTransform,
        updateStyle,
        updateLayerName,
        updateThemeParam,
        addThemeParam,
        removeThemeParam,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorStore() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorStore must be used within an EditorProvider");
  }
  return context;
}

import { applyOps, createDefaultDoc } from "@animator/core";
import type { Layer, MotionDoc, Op, Param } from "@animator/core";
import { useCallback, useState } from "react";

export type TabType = "inspector" | "params";

export interface SceneStoreState {
  doc: MotionDoc;
  selectedNodeId: string | null;
  activeTab: TabType;
  canUndo: boolean;
  canRedo: boolean;
  selectNode: (id: string | null) => void;
  setActiveTab: (tab: TabType) => void;
  applyOps: (ops: Op[]) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  setParam: (name: string, param: Param | null) => void;
  addParam: (name: string, param: Param) => void;
  removeParam: (name: string) => void;
  undo: () => void;
  redo: () => void;
}

export function useSceneStore(initialDoc?: MotionDoc) {
  const [doc, setDoc] = useState<MotionDoc>(
    () => initialDoc ?? createDefaultDoc(),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("rect-1");
  const [activeTab, setActiveTab] = useState<TabType>("inspector");
  const [past, setPast] = useState<MotionDoc[]>([]);
  const [future, setFuture] = useState<MotionDoc[]>([]);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const dispatchOps = useCallback((ops: Op[]) => {
    setDoc((currentDoc: MotionDoc) => {
      setPast((prevPast: MotionDoc[]) => [...prevPast, currentDoc]);
      setFuture([]);
      const result = applyOps(currentDoc, ops);
      return result.doc;
    });
  }, []);

  const updateLayer = useCallback(
    (id: string, updates: Partial<Layer>) => {
      dispatchOps([{ op: "updateLayer", id, set: updates }]);
    },
    [dispatchOps],
  );

  const setParam = useCallback(
    (name: string, param: Param | null) => {
      dispatchOps([{ op: "setParam", name, param }]);
    },
    [dispatchOps],
  );

  const addParam = useCallback(
    (name: string, param: Param) => {
      dispatchOps([{ op: "setParam", name, param }]);
    },
    [dispatchOps],
  );

  const removeParam = useCallback(
    (name: string) => {
      dispatchOps([{ op: "setParam", name, param: null }]);
    },
    [dispatchOps],
  );

  const undo = useCallback(() => {
    setPast((prevPast: MotionDoc[]) => {
      if (prevPast.length === 0) return prevPast;
      const previousDoc = prevPast[prevPast.length - 1];
      if (!previousDoc) return prevPast;

      setDoc((currentDoc: MotionDoc) => {
        setFuture((prevFuture: MotionDoc[]) => [currentDoc, ...prevFuture]);
        return previousDoc;
      });

      return prevPast.slice(0, prevPast.length - 1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prevFuture: MotionDoc[]) => {
      if (prevFuture.length === 0) return prevFuture;
      const nextDoc = prevFuture[0];
      if (!nextDoc) return prevFuture;

      setDoc((currentDoc: MotionDoc) => {
        setPast((prevPast: MotionDoc[]) => [...prevPast, currentDoc]);
        return nextDoc;
      });

      return prevFuture.slice(1);
    });
  }, []);

  return {
    doc,
    selectedNodeId,
    activeTab,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    selectNode,
    setActiveTab,
    applyOps: dispatchOps,
    updateLayer,
    setParam,
    addParam,
    removeParam,
    undo,
    redo,
  };
}

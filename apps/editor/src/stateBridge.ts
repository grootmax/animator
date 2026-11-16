import {
  type ApplyOpsResult,
  type MotionDoc,
  type Op,
  applyOps,
  compileToLottie,
  createDefaultMotionDoc,
} from "@animator/core";
import { useCallback, useState } from "react";

export interface EditorState {
  doc: MotionDoc;
  revision: number;
  lottieJson: Record<string, unknown>;
  lastChangedIds: string[];
}

/**
 * Creates the initial editor state from a default or custom MotionDoc.
 */
export function createInitialEditorState(initialDoc?: MotionDoc): EditorState {
  const doc = initialDoc ?? createDefaultMotionDoc();
  return {
    doc,
    revision: 0,
    lottieJson: compileToLottie(doc),
    lastChangedIds: [],
  };
}

/**
 * React hook providing state management and atomic operation dispatch
 * for the editor and socket/bridge synchronization.
 */
export function useEditorState(initialDoc?: MotionDoc) {
  const [state, setState] = useState<EditorState>(() =>
    createInitialEditorState(initialDoc),
  );

  const dispatchOps = useCallback((ops: Op[]) => {
    setState((prev) => {
      const result: ApplyOpsResult = applyOps(prev.doc, ops, prev.revision);
      const lottieJson = compileToLottie(result.doc);
      return {
        doc: result.doc,
        revision: result.revision,
        lottieJson,
        lastChangedIds: result.changedIds,
      };
    });
  }, []);

  const resetDoc = useCallback((doc?: MotionDoc) => {
    setState(createInitialEditorState(doc));
  }, []);

  return {
    ...state,
    dispatchOps,
    resetDoc,
  };
}

import { createInitialMotionState, motionPatchReducer } from "@animator/core";
import type { MotionDoc, MotionPatch, MotionState } from "@animator/core";

export class AnimationWorkerRuntime {
  private state: MotionState | null = null;

  public init(doc: MotionDoc): MotionState {
    this.state = createInitialMotionState(doc);
    return this.state;
  }

  public applyPatch(patch: MotionPatch): MotionState | null {
    if (!this.state) return null;
    this.state = motionPatchReducer(this.state, patch);
    return this.state;
  }

  public getState(): MotionState | null {
    return this.state;
  }
}

if (
  typeof self !== "undefined" &&
  typeof self.addEventListener === "function"
) {
  const runtime = new AnimationWorkerRuntime();

  self.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;

    if (data.type === "INIT") {
      const state = runtime.init(data.doc);
      self.postMessage({ type: "INIT_ACK", state });
    } else if (data.type === "PATCH") {
      const state = runtime.applyPatch(data.patch as MotionPatch);
      if (state) {
        self.postMessage({ type: "STATE_UPDATE", state, patch: data.patch });
      }
    }
  });
}

export const RENDER_VERSION = "0.0.0";

export { type CanvasKit, getCanvasKit } from "./canvaskit.js";
export {
  renderFrame,
  type RenderFrameOptions,
  SkottieAnimation,
} from "./renderFrame.js";
export {
  renderContactSheet,
  type ContactSheetOptions,
} from "./contactSheet.js";
export {
  comparePngSnapshots,
  type SnapshotCompareOptions,
  type SnapshotCompareResult,
} from "./snapshot.js";

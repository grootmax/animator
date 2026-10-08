import { PixiBridge } from "./pixiBridge.js";
import { SkottieBridge } from "./skottieBridge.js";
import type {
  IRendererBridge,
  RendererBackend,
  RendererConfig,
} from "./types.js";

/**
 * Creates an IRendererBridge instance based on configuration flag.
 * Defaults to SkottieBridge (canvaskit-wasm).
 */
export function createRendererBridge(config?: RendererConfig): IRendererBridge {
  const backend = config?.backend ?? "skottie";
  if (backend === "pixi") {
    return new PixiBridge(config);
  }
  return new SkottieBridge(config);
}

/**
 * Transitions between backend renderers smoothly without losing scene nodes,
 * viewport navigation state, or transform handles.
 */
export async function switchRendererBackend(
  currentBridge: IRendererBridge,
  newBackend: RendererBackend,
  container: HTMLElement | HTMLCanvasElement,
  config?: RendererConfig,
): Promise<IRendererBridge> {
  const sceneNodes = currentBridge.getSceneNodes();
  const viewport = currentBridge.getViewport();
  const transformHandles = currentBridge.getTransformHandles();

  currentBridge.destroy();

  const newBridge = createRendererBridge({ ...config, backend: newBackend });
  await newBridge.init(container);
  newBridge.syncSceneNodes(sceneNodes);
  newBridge.updateViewport(viewport);
  newBridge.setTransformHandles(transformHandles);

  return newBridge;
}

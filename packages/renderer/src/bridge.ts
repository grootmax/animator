import type {
  SceneNode,
  createAssetRegistryStore,
  createSceneGraphStore,
} from "@monorepo/scene-graph";

export class PixiBridge {
  public store: ReturnType<typeof createSceneGraphStore>;
  public assetStore: ReturnType<typeof createAssetRegistryStore> | undefined;
  public videoElements: Map<string, HTMLVideoElement> = new Map();
  public canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    store: ReturnType<typeof createSceneGraphStore>,
    assetStore?: ReturnType<typeof createAssetRegistryStore>,
  ) {
    this.canvas = canvas;
    this.store = store;
    this.assetStore = assetStore;
  }

  public registerVideoElement(
    nodeId: string,
    videoElement: HTMLVideoElement,
  ): void {
    videoElement.muted = true; // Guardrail: Mute preview video elements on canvas
    videoElement.pause(); // Guardrail: Keep paused during rendering
    this.videoElements.set(nodeId, videoElement);
  }

  /**
   * Synchronize all video element playhead positions to the requested timestamp.
   * Calculates clip offsets, updates videoElement.currentTime, and waits for `seeked` DOM events.
   * Guardrail: Max 500ms timeout guard per frame seek to prevent export hangs.
   */
  public async syncVideoAssets(timeMs: number): Promise<void> {
    const state = this.store.getState();
    const nodes = Object.values(state.nodes) as SceneNode[];
    const videoNodes = nodes.filter((n) => n.type === "video");

    const seekPromises = videoNodes.map((node) => {
      const asset =
        node.assetId && this.assetStore
          ? this.assetStore.getState().assets[node.assetId]
          : undefined;
      const videoElement = (asset?.element ||
        this.videoElements.get(node.id)) as HTMLVideoElement | undefined;

      if (!videoElement) {
        return Promise.resolve();
      }

      // Constraints & Guardrails:
      // 1. HTMLVideoElements must remain paused during offline frame export
      videoElement.pause();

      // 2. Mute preview video elements on canvas to prevent browser autoplay restrictions
      videoElement.muted = true;

      const startTime = node.startTime ?? 0;
      const mediaOffset = node.mediaOffset ?? 0;
      const duration = node.duration ?? 0;
      const loop = !!node.loop;

      let targetMs = 0;
      if (timeMs < startTime) {
        targetMs = mediaOffset;
      } else {
        const elapsed = timeMs - startTime;
        if (duration > 0) {
          if (elapsed > duration) {
            if (loop) {
              targetMs = mediaOffset + (elapsed % duration);
            } else {
              targetMs = mediaOffset + duration;
            }
          } else {
            targetMs = mediaOffset + elapsed;
          }
        } else {
          targetMs = mediaOffset + elapsed;
        }
      }

      const targetSec = targetMs / 1000;

      // Skip seek if already within 1ms tolerance
      if (Math.abs(videoElement.currentTime - targetSec) < 0.001) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (!settled) {
            settled = true;
            videoElement.removeEventListener("seeked", onSeeked);
            resolve();
          }
        }, 500);

        const onSeeked = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            videoElement.removeEventListener("seeked", onSeeked);
            resolve();
          }
        };

        videoElement.addEventListener("seeked", onSeeked, { once: true });
        videoElement.currentTime = targetSec;
      });
    });

    await Promise.all(seekPromises);
  }
}

/**
 * Connect active video elements to a WebAudio MediaStreamAudioDestinationNode
 * during export to output mixed audio alongside canvas.captureStream().
 */
export function connectVideoAudioToDestination(
  videoElements: HTMLVideoElement[],
  audioCtx?: AudioContext,
): { destination: MediaStreamAudioDestinationNode; ctx: AudioContext } {
  const ctx =
    audioCtx ||
    new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  const destination = ctx.createMediaStreamDestination();

  for (const videoEl of videoElements) {
    if (videoEl) {
      try {
        const source = ctx.createMediaElementSource(videoEl);
        const gainNode = ctx.createGain();
        gainNode.gain.value = videoEl.muted ? 0 : (videoEl.volume ?? 1);
        source.connect(gainNode);
        gainNode.connect(destination);
      } catch {
        // Source already created or non-browser fallback
      }
    }
  }

  return { destination, ctx };
}

/**
 * Frame-by-frame offline export function that waits for video seeked events
 * before capturing canvas frames.
 */
export async function exportFrameByFrame(
  bridge: PixiBridge,
  canvas: HTMLCanvasElement,
  frameTimesMs: number[],
  onFrameCaptured?: (frameIndex: number, timeMs: number) => void,
): Promise<void> {
  for (let i = 0; i < frameTimesMs.length; i++) {
    const timeMs = frameTimesMs[i];
    if (timeMs !== undefined) {
      await bridge.syncVideoAssets(timeMs);
      if (onFrameCaptured) {
        onFrameCaptured(i, timeMs);
      }
    }
  }
}

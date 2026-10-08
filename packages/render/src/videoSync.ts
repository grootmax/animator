import type { SceneNode } from "@animator/core";

export interface RegisteredVideo {
  nodeId: string;
  element: HTMLVideoElement;
  node?: SceneNode | undefined;
  audioSourceNode?: MediaElementAudioSourceNode | undefined;
}

const videoRegistry = new Map<string, RegisteredVideo>();

export function registerVideoElement(
  nodeId: string,
  element: HTMLVideoElement,
  node?: SceneNode | undefined,
): void {
  const existing = videoRegistry.get(nodeId);
  if (existing) {
    existing.element = element;
    if (node !== undefined) {
      existing.node = node;
    }
  } else {
    const reg: RegisteredVideo = { nodeId, element };
    if (node !== undefined) {
      reg.node = node;
    }
    videoRegistry.set(nodeId, reg);
  }
}

export function getVideoElementForNode(
  nodeId: string,
): HTMLVideoElement | undefined {
  return videoRegistry.get(nodeId)?.element;
}

export function getVideoRegistry(): Map<string, RegisteredVideo> {
  return videoRegistry;
}

export function clearVideoElements(): void {
  videoRegistry.clear();
}

/**
 * Synchronize video element seeking for offline rendering / frame capture.
 */
export async function syncVideoAssets(
  timeMs: number,
  nodesMap?: Map<string, SceneNode>,
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const [nodeId, reg] of videoRegistry.entries()) {
    const video = reg.element;
    const node = nodesMap?.get(nodeId) ?? reg.node;

    const startTime = node?.startTime ?? 0;
    const mediaOffset = node?.mediaOffset ?? 0;
    const duration = node?.duration;
    const loop = node?.loop ?? false;

    let clipTimeMs = timeMs - startTime + mediaOffset;

    if (clipTimeMs < mediaOffset) {
      clipTimeMs = mediaOffset;
    } else if (
      duration !== undefined &&
      duration > 0 &&
      clipTimeMs > mediaOffset + duration
    ) {
      if (loop) {
        clipTimeMs = mediaOffset + ((clipTimeMs - mediaOffset) % duration);
      } else {
        clipTimeMs = mediaOffset + duration;
      }
    }

    const targetSeconds = Math.max(0, clipTimeMs / 1000);

    // Enforce video paused during seeking for deterministic frame capture
    try {
      if (!video.paused) {
        video.pause();
      }
    } catch {
      // ignore
    }

    if (node?.muted !== undefined) {
      video.muted = node.muted;
    }

    // Set target time
    if (Math.abs(video.currentTime - targetSeconds) > 0.001) {
      const seekPromise = new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = targetSeconds;
      });

      // 500ms timeout guard to prevent hangs
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });

      promises.push(Promise.race([seekPromise, timeoutPromise]));
    }
  }

  await Promise.all(promises);
}

/**
 * Setup WebAudio destination routing for video elements
 */
export function setupExportAudioStream(
  audioCtx?: AudioContext,
): MediaStreamAudioDestinationNode {
  const AudioContextClass =
    audioCtx?.constructor ||
    (typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      : undefined);

  const ctx =
    audioCtx ??
    (AudioContextClass
      ? new (AudioContextClass as new () => AudioContext)()
      : ({
          createMediaStreamDestination: () => ({
            stream: { getAudioTracks: () => [] },
          }),
          createMediaElementSource: () => ({
            connect: () => {},
          }),
          createGain: () => ({
            gain: { value: 1 },
            connect: () => {},
          }),
        } as unknown as AudioContext));

  const destination = ctx.createMediaStreamDestination();

  for (const reg of videoRegistry.values()) {
    const video = reg.element;
    const node = reg.node;

    if (!reg.audioSourceNode) {
      reg.audioSourceNode = ctx.createMediaElementSource(video);
    }

    const gainNode = ctx.createGain();
    const volume = node?.volume ?? 1.0;
    const isMuted = node?.muted ?? false;

    gainNode.gain.value = isMuted ? 0 : volume;

    reg.audioSourceNode.connect(gainNode);
    gainNode.connect(destination);
  }

  return destination;
}

/**
 * Combine canvas stream with WebAudio export destination stream
 */
export function getExportMediaStream(
  canvas: HTMLCanvasElement,
  audioCtx?: AudioContext,
): MediaStream {
  const canvasStream =
    typeof canvas.captureStream === "function"
      ? canvas.captureStream()
      : (new (typeof window !== "undefined" && window.MediaStream
          ? window.MediaStream
          : (class DummyMediaStream {
              addTrack() {}
              getVideoTracks() {
                return [];
              }
              getAudioTracks() {
                return [];
              }
            } as unknown as typeof MediaStream))() as MediaStream);

  const audioDestination = setupExportAudioStream(audioCtx);

  const combined = new (
    typeof window !== "undefined" && window.MediaStream
      ? window.MediaStream
      : (class DummyMediaStream {
          tracks: unknown[] = [];
          addTrack(track: unknown) {
            this.tracks.push(track);
          }
          getVideoTracks() {
            return [];
          }
          getAudioTracks() {
            return [];
          }
        } as unknown as typeof MediaStream)
  )();

  if (canvasStream.getVideoTracks) {
    for (const track of canvasStream.getVideoTracks()) {
      combined.addTrack(track);
    }
  }

  if (audioDestination.stream.getAudioTracks) {
    for (const track of audioDestination.stream.getAudioTracks()) {
      combined.addTrack(track);
    }
  }

  return combined;
}

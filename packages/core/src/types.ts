export interface Keyframe {
  t: number;
  v: number | number[] | string;
  ease?: string | undefined;
}

export interface AnimationTrack {
  prop: string;
  keyframes: Keyframe[];
}

export interface Layer {
  id: string;
  name: string;
  type: string;
  in: number;
  out: number;
  visible?: boolean | undefined;
  position?: [number, number] | undefined;
  scale?: [number, number] | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  tracks: Record<string, AnimationTrack>;
}

export interface CanvasConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background?: string | undefined;
}

export interface MotionDocument {
  version: number;
  name: string;
  canvas: CanvasConfig;
  layers: Layer[];
}

export type AnimationOperation =
  | {
      type: "updateKeyframeTime";
      layerId: string;
      prop: string;
      keyframeIndex: number;
      newTime: number;
      source?: string | undefined;
    }
  | {
      type: "updateLayerDuration";
      layerId: string;
      duration: { inTime?: number | undefined; outTime?: number | undefined };
      source?: string | undefined;
    }
  | {
      type: "addKeyframe";
      layerId: string;
      prop: string;
      keyframe: Keyframe;
      source?: string | undefined;
    }
  | {
      type: "deleteKeyframe";
      layerId: string;
      prop: string;
      keyframeIndex: number;
      source?: string | undefined;
    };

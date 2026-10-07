export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  id?: string;
  time: number; // in milliseconds
  value: number | string;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: string;
  keyframes: Keyframe[] | Record<string, Keyframe>;
}

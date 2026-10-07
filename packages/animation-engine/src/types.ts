export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';
export type NetworkRole = 'standalone' | 'leader' | 'follower';

export interface Heartbeat {
  playhead: number;
  isPlaying: boolean;
}

export interface Keyframe {
  frame: number; // Discrete frame index
  value: number | string;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'fill' | 'stroke' | 'pathData';
  keyframes: Keyframe[];
}

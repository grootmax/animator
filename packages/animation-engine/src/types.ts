export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';

export interface Keyframe {
  id?: string;
  time: number; // in milliseconds
  value: number | string;
  easing?: EasingType;
}

export interface Track {
  nodeId: string;
  property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'fill' | 'stroke' | 'pathData';
  keyframes: Keyframe[];
}

export type NetworkRole = 'standalone' | 'leader' | 'follower' | 'host' | 'client';

export interface Heartbeat {
  sequence?: number;
  playhead: number;
  timestamp?: number;
  isPlaying?: boolean;
}

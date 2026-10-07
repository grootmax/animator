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

export type NetworkRole = 'standalone' | 'leader' | 'follower';

export interface Heartbeat {
  time: number;
  playhead: number;
  role: NetworkRole;
  isPlaying?: boolean;
}

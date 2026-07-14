export interface Asset {
  id: string;
  src: string;
  type: 'video' | 'image' | string;
  loaded: boolean;
  element?: HTMLImageElement | HTMLVideoElement;
}

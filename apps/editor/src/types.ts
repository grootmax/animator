export interface Transform {
  position: [number, number];
  scale: [number, number];
  rotation: number;
  opacity: number;
}

export interface LayerStyle {
  fill?: string;
  stroke?: {
    color: string;
    width: number;
  };
  fontSize?: number;
  fontFamily?: string;
  text?: string;
  size?: [number, number];
}

export interface Layer {
  id: string;
  name: string;
  type: "shape" | "text" | "image" | "group";
  transform: Transform;
  style: LayerStyle;
  visible?: boolean;
}

export interface ThemeParam {
  id: string;
  key: string;
  type: "color" | "text" | "number";
  value: string | number;
  label: string;
}

export interface MotionDoc {
  version: number;
  name: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background: string;
  };
  params: Record<string, ThemeParam>;
  layers: Layer[];
}

export type ExportFormat = "mp4" | "webm" | "gif" | "svg" | "lottie";

export type ResolutionPreset = "1080p" | "720p" | "480p";

export interface ExportPreset {
  id: string;
  label: string;
  format: ExportFormat;
  resolution?: ResolutionPreset;
  fps?: number;
  description: string;
  badge?: string;
}

export type RenderStatus = "idle" | "rendering" | "completed" | "error";

export interface ExportState {
  status: RenderStatus;
  progress: number;
  currentPreset?: ExportPreset;
  downloadUrl?: string;
  error?: string;
}

export const DEFAULT_EXPORT_PRESET: ExportPreset = {
  id: "mp4-1080p",
  label: "MP4 1080p",
  format: "mp4",
  resolution: "1080p",
  fps: 30,
  description: "Full HD Video (H.264)",
  badge: "Default",
};

export const EXPORT_PRESETS: ExportPreset[] = [
  DEFAULT_EXPORT_PRESET,
  {
    id: "mp4-720p",
    label: "MP4 720p",
    format: "mp4",
    resolution: "720p",
    fps: 30,
    description: "HD Video (Fast Render)",
  },
  {
    id: "webm-1080p",
    label: "WebM 1080p",
    format: "webm",
    resolution: "1080p",
    fps: 30,
    description: "Full HD with Transparency",
  },
  {
    id: "webm-720p",
    label: "WebM 720p",
    format: "webm",
    resolution: "720p",
    fps: 30,
    description: "HD Web Preview",
  },
  {
    id: "gif-720p",
    label: "GIF 720p",
    format: "gif",
    resolution: "720p",
    fps: 15,
    description: "High Quality Animated GIF",
  },
  {
    id: "gif-480p",
    label: "GIF 480p",
    format: "gif",
    resolution: "480p",
    fps: 15,
    description: "Compact Animated GIF",
  },
  {
    id: "svg-static",
    label: "SVG Vector",
    format: "svg",
    description: "Static Vector Graphic",
  },
  {
    id: "lottie-json",
    label: "Lottie JSON",
    format: "lottie",
    description: "Lottie Animation Spec File",
  },
];

import type React from "react";
import { useEffect, useRef, useState } from "react";

export type VideoFormat = "MP4" | "WebM" | "GIF";
export type ResolutionPreset = "4K" | "1080p" | "720p" | "Custom";
export type FrameRateOption = 24 | 30 | 60;

export interface ExportConfig {
  format: VideoFormat;
  resolutionPreset: ResolutionPreset;
  width: number;
  height: number;
  fps: FrameRateOption;
  bitrateQuality: number; // 1-100
  gifLoopCount: number; // 0 for infinite, >0 for finite count
}

export interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectDurationSec?: number;
  initialWidth?: number;
  initialHeight?: number;
  onStartExport?: (config: ExportConfig) => void;
  onCancelExport?: () => void;
}

const RESOLUTION_PRESETS: Record<
  ResolutionPreset,
  { width: number; height: number }
> = {
  "4K": { width: 3840, height: 2160 },
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  Custom: { width: 1920, height: 1080 },
};

const MIN_DIMENSION = 128;
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  isOpen,
  onClose,
  projectDurationSec = 4.0,
  initialWidth = 1920,
  initialHeight = 1080,
  onStartExport,
  onCancelExport,
}) => {
  const [format, setFormat] = useState<VideoFormat>("MP4");
  const [resolutionPreset, setResolutionPreset] =
    useState<ResolutionPreset>("1080p");
  const [width, setWidth] = useState<number>(initialWidth);
  const [height, setHeight] = useState<number>(initialHeight);
  const [fps, setFps] = useState<FrameRateOption>(60);
  const [bitrateQuality, setBitrateQuality] = useState<number>(80);
  const [gifLoopCount, setGifLoopCount] = useState<number>(0);

  // Render / progress state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const renderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Synchronize preset changes to width/height
  const handlePresetChange = (preset: ResolutionPreset) => {
    setResolutionPreset(preset);
    if (preset !== "Custom") {
      const dimensions = RESOLUTION_PRESETS[preset];
      setWidth(dimensions.width);
      setHeight(dimensions.height);
    }
  };

  const handleWidthChange = (val: number) => {
    setWidth(val);
    setResolutionPreset("Custom");
  };

  const handleHeightChange = (val: number) => {
    setHeight(val);
    setResolutionPreset("Custom");
  };

  // Validation
  const widthError =
    Number.isNaN(width) || width < MIN_DIMENSION || width > MAX_WIDTH
      ? `Width must be between ${MIN_DIMENSION} and ${MAX_WIDTH}px.`
      : null;

  const heightError =
    Number.isNaN(height) || height < MIN_DIMENSION || height > MAX_HEIGHT
      ? `Height must be between ${MIN_DIMENSION} and ${MAX_HEIGHT}px.`
      : null;

  const isValid = !widthError && !heightError;

  const totalFrames = Math.max(1, Math.round(projectDurationSec * fps));
  const progressPercent = Math.min(
    100,
    Math.round((currentFrame / totalFrames) * 100),
  );

  // Reset export state safely
  const resetExportState = () => {
    if (renderTimerRef.current) {
      clearInterval(renderTimerRef.current);
      renderTimerRef.current = null;
    }
    setIsExporting(false);
    setCurrentFrame(0);
    setIsCompleted(false);
  };

  const handleCancel = () => {
    resetExportState();
    if (onCancelExport) {
      onCancelExport();
    }
    onClose();
  };

  const handleStartExport = () => {
    if (!isValid || isExporting) return;

    const config: ExportConfig = {
      format,
      resolutionPreset,
      width,
      height,
      fps,
      bitrateQuality,
      gifLoopCount,
    };

    setIsExporting(true);
    setCurrentFrame(0);
    setIsCompleted(false);

    if (onStartExport) {
      onStartExport(config);
    }

    // Simulate export progress for feedback
    const frameInterval = 50; // ms per frame simulation step
    const stepSize = Math.max(1, Math.floor(totalFrames / 20));

    renderTimerRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        const next = prev + stepSize;
        if (next >= totalFrames) {
          if (renderTimerRef.current) {
            clearInterval(renderTimerRef.current);
            renderTimerRef.current = null;
          }
          setIsCompleted(true);
          return totalFrames;
        }
        return next;
      });
    }, frameInterval);
  };

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (renderTimerRef.current) {
        clearInterval(renderTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <dialog
      open
      className="modal-overlay"
      style={styles.overlay}
      aria-labelledby="export-modal-title"
    >
      <div className="modal-container" style={styles.container}>
        <div className="modal-header" style={styles.header}>
          <h2 id="export-modal-title" style={styles.title}>
            Export Video
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            style={styles.closeButton}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body" style={styles.body}>
          {/* Format Selection */}
          <div className="form-group" style={styles.formGroup}>
            <span style={styles.label}>Video Format</span>
            <div className="format-options" style={styles.buttonGroup}>
              {(["MP4", "WebM", "GIF"] as VideoFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  disabled={isExporting}
                  style={
                    format === f
                      ? { ...styles.segmentButton, ...styles.activeSegment }
                      : styles.segmentButton
                  }
                  className={`btn-format-${f.toLowerCase()}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* GIF Loop Count option */}
          {format === "GIF" && (
            <div className="form-group" style={styles.formGroup}>
              <label htmlFor="gif-loop-input" style={styles.label}>
                GIF Loop Count
              </label>
              <select
                id="gif-loop-input"
                value={gifLoopCount}
                onChange={(e) => setGifLoopCount(Number(e.target.value))}
                disabled={isExporting}
                style={styles.select}
              >
                <option value={0}>Infinite Loop (0)</option>
                <option value={1}>Play Once (1)</option>
                <option value={2}>2 Times</option>
                <option value={3}>3 Times</option>
                <option value={5}>5 Times</option>
              </select>
            </div>
          )}

          {/* Resolution Preset */}
          <div className="form-group" style={styles.formGroup}>
            <span style={styles.label}>Resolution Preset</span>
            <div className="preset-options" style={styles.buttonGroup}>
              {(["4K", "1080p", "720p", "Custom"] as ResolutionPreset[]).map(
                (p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePresetChange(p)}
                    disabled={isExporting}
                    style={
                      resolutionPreset === p
                        ? { ...styles.segmentButton, ...styles.activeSegment }
                        : styles.segmentButton
                    }
                    className={`btn-preset-${p.toLowerCase()}`}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Custom Width and Height Inputs */}
          <div className="form-group" style={styles.formGroup}>
            <span style={styles.label}>Dimensions (px)</span>
            <div style={styles.dimensionInputs}>
              <div style={styles.inputWrapper}>
                <span style={styles.inputLabel}>Width:</span>
                <input
                  type="number"
                  aria-label="Custom Width"
                  value={Number.isNaN(width) ? "" : width}
                  onChange={(e) =>
                    handleWidthChange(Number.parseInt(e.target.value, 10))
                  }
                  disabled={isExporting}
                  style={
                    widthError
                      ? { ...styles.input, ...styles.inputError }
                      : styles.input
                  }
                />
              </div>
              <span style={styles.dimensionSeparator}>×</span>
              <div style={styles.inputWrapper}>
                <span style={styles.inputLabel}>Height:</span>
                <input
                  type="number"
                  aria-label="Custom Height"
                  value={Number.isNaN(height) ? "" : height}
                  onChange={(e) =>
                    handleHeightChange(Number.parseInt(e.target.value, 10))
                  }
                  disabled={isExporting}
                  style={
                    heightError
                      ? { ...styles.input, ...styles.inputError }
                      : styles.input
                  }
                />
              </div>
            </div>
            {/* Inline Validation Errors */}
            {widthError && (
              <div className="validation-error" style={styles.errorMessage}>
                {widthError}
              </div>
            )}
            {heightError && (
              <div className="validation-error" style={styles.errorMessage}>
                {heightError}
              </div>
            )}
          </div>

          {/* Target Frame Rate */}
          <div className="form-group" style={styles.formGroup}>
            <span style={styles.label}>Frame Rate</span>
            <div className="framerate-options" style={styles.buttonGroup}>
              {([24, 30, 60] as FrameRateOption[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFps(r)}
                  disabled={isExporting}
                  style={
                    fps === r
                      ? { ...styles.segmentButton, ...styles.activeSegment }
                      : styles.segmentButton
                  }
                  className={`btn-fps-${r}`}
                >
                  {r} fps
                </button>
              ))}
            </div>
          </div>

          {/* Bitrate / Quality Slider */}
          <div className="form-group" style={styles.formGroup}>
            <div style={styles.labelWithVal}>
              <label htmlFor="quality-slider" style={styles.label}>
                Quality / Bitrate
              </label>
              <span style={styles.valueBadge}>{bitrateQuality}%</span>
            </div>
            <input
              id="quality-slider"
              type="range"
              min="1"
              max="100"
              value={bitrateQuality}
              onChange={(e) => setBitrateQuality(Number(e.target.value))}
              disabled={isExporting}
              style={styles.slider}
            />
          </div>

          {/* Calculated Stats */}
          <div className="stats-box" style={styles.statsBox}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Duration:</span>
              <span style={styles.statValue}>
                {projectDurationSec.toFixed(1)}s
              </span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Total calculated frames:</span>
              <span
                style={styles.statValue}
                className="total-calculated-frames"
              >
                {totalFrames} frames ({fps} fps)
              </span>
            </div>
          </div>

          {/* Active Progress Feedback */}
          {isExporting && (
            <div className="progress-section" style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <span
                  className="progress-status-text"
                  style={styles.progressStatus}
                >
                  {isCompleted
                    ? "Export Complete!"
                    : `Rendering frame ${currentFrame} of ${totalFrames} (${progressPercent}%)`}
                </span>
                <span
                  className="progress-percent"
                  style={styles.progressPercentText}
                >
                  {progressPercent}%
                </span>
              </div>
              <div className="progress-bar-bg" style={styles.progressBarBg}>
                <div
                  className="progress-bar-fill"
                  style={{
                    ...styles.progressBarFill,
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={styles.footer}>
          <button
            type="button"
            onClick={handleCancel}
            style={styles.secondaryButton}
            className="btn-cancel-export"
          >
            {isExporting ? "Cancel Export" : "Cancel"}
          </button>
          {!isCompleted ? (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={!isValid || isExporting}
              style={
                !isValid || isExporting
                  ? { ...styles.primaryButton, ...styles.disabledButton }
                  : styles.primaryButton
              }
              className="btn-start-export"
            >
              {isExporting ? "Exporting..." : "Start Export"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetExportState();
                onClose();
              }}
              style={styles.primaryButton}
              className="btn-done-export"
            >
              Done & Download
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(17, 17, 27, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    fontFamily: "system-ui, -apple-system, sans-serif",
    border: "none",
    padding: 0,
    margin: 0,
  },
  container: {
    backgroundColor: "#1e1e2e",
    borderRadius: "12px",
    border: "1px solid #313244",
    width: "480px",
    maxWidth: "90vw",
    boxShadow:
      "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
    color: "#cdd6f4",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #313244",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#f5e0dc",
  },
  closeButton: {
    background: "none",
    border: "none",
    color: "#a6adc8",
    fontSize: "20px",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "4px",
  },
  body: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxHeight: "75vh",
    overflowY: "auto",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#a6adc8",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  labelWithVal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  valueBadge: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#89b4fa",
    backgroundColor: "#313244",
    padding: "2px 8px",
    borderRadius: "10px",
  },
  buttonGroup: {
    display: "flex",
    backgroundColor: "#181825",
    borderRadius: "8px",
    padding: "4px",
    gap: "4px",
  },
  segmentButton: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "transparent",
    color: "#a6adc8",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
    transition: "all 0.15s ease",
  },
  activeSegment: {
    backgroundColor: "#313244",
    color: "#89b4fa",
    fontWeight: 600,
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  dimensionInputs: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
  },
  inputLabel: {
    fontSize: "13px",
    color: "#a6adc8",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    backgroundColor: "#181825",
    color: "#cdd6f4",
    fontSize: "14px",
    outline: "none",
  },
  inputError: {
    border: "1px solid #f38ba8",
  },
  errorMessage: {
    fontSize: "12px",
    color: "#f38ba8",
    marginTop: "2px",
  },
  dimensionSeparator: {
    color: "#585b70",
    fontWeight: "bold",
  },
  select: {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    backgroundColor: "#181825",
    color: "#cdd6f4",
    fontSize: "14px",
    outline: "none",
  },
  slider: {
    accentColor: "#89b4fa",
    cursor: "pointer",
  },
  statsBox: {
    backgroundColor: "#181825",
    borderRadius: "8px",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    border: "1px solid #313244",
  },
  statItem: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
  },
  statLabel: {
    color: "#a6adc8",
  },
  statValue: {
    color: "#cdd6f4",
    fontWeight: 600,
  },
  progressSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: "#181825",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #313244",
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
  },
  progressStatus: {
    color: "#89b4fa",
    fontWeight: 500,
  },
  progressPercentText: {
    color: "#a6adc8",
    fontWeight: 600,
  },
  progressBarBg: {
    height: "8px",
    width: "100%",
    backgroundColor: "#313244",
    borderRadius: "4px",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#89b4fa",
    transition: "width 0.15s ease",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    padding: "16px 20px",
    borderTop: "1px solid #313244",
    backgroundColor: "#181825",
  },
  primaryButton: {
    padding: "8px 18px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#89b4fa",
    color: "#11111b",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  secondaryButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    backgroundColor: "#313244",
    color: "#cdd6f4",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};

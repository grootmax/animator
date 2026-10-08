import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toolbar } from "./components/Toolbar.js";
import {
  type ExportConfig,
  VideoExportModal,
} from "./components/VideoExportModal.js";

export interface AppProps {
  initialDurationSec?: number;
  initialWidth?: number;
  initialHeight?: number;
}

export function App({
  initialDurationSec = 4.0,
  initialWidth = 1920,
  initialHeight = 1080,
}: AppProps) {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleOpenVideoExport = () => {
    if (!isExporting) {
      setIsModalOpen(true);
    }
  };

  const handleExportSVG = () => {
    if (isExporting) return;
    setExportMessage("Exported SVG vector graphics successfully.");
    setTimeout(() => setExportMessage(null), 3000);
  };

  const handleExportJSON = () => {
    if (isExporting) return;
    setExportMessage("Exported JSON state file successfully.");
    setTimeout(() => setExportMessage(null), 3000);
  };

  const handleStartExport = (config: ExportConfig) => {
    setIsExporting(true);
    setExportMessage(
      `Active export running: ${config.format} (${config.width}x${config.height} @ ${config.fps}fps)`,
    );
  };

  const handleCancelExport = () => {
    setIsExporting(false);
    setExportMessage("Video export canceled.");
    setTimeout(() => setExportMessage(null), 3000);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div style={styles.appContainer}>
      <Toolbar
        onOpenVideoExport={handleOpenVideoExport}
        onExportSVG={handleExportSVG}
        onExportJSON={handleExportJSON}
        isLocked={isExporting}
      />

      <main style={styles.mainContent}>
        {exportMessage && (
          <div className="toast-notification" style={styles.toast}>
            {exportMessage}
          </div>
        )}

        <div style={styles.canvasContainer}>
          <h1 style={styles.heading}>Animator Studio Editor</h1>
          <p style={styles.subheading}>
            Scene State: {initialWidth}×{initialHeight} | Duration:{" "}
            {initialDurationSec.toFixed(1)}s
          </p>
          <div style={styles.canvasPlaceholder}>
            <span>Canvas Scene Preview</span>
          </div>
        </div>
      </main>

      <VideoExportModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        projectDurationSec={initialDurationSec}
        initialWidth={initialWidth}
        initialHeight={initialHeight}
        onStartExport={handleStartExport}
        onCancelExport={handleCancelExport}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    minHeight: "100vh",
    backgroundColor: "#11111b",
    color: "#cdd6f4",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  mainContent: {
    flex: 1,
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  toast: {
    padding: "10px 16px",
    backgroundColor: "#313244",
    color: "#89b4fa",
    borderRadius: "6px",
    border: "1px solid #45475a",
    marginBottom: "16px",
    fontSize: "14px",
  },
  canvasContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "800px",
  },
  heading: {
    fontSize: "24px",
    margin: "0 0 8px 0",
    fontWeight: 600,
  },
  subheading: {
    color: "#a6adc8",
    fontSize: "14px",
    marginBottom: "24px",
  },
  canvasPlaceholder: {
    width: "100%",
    height: "400px",
    backgroundColor: "#181825",
    border: "2px dashed #313244",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#585b70",
    fontSize: "16px",
  },
};

if (typeof document !== "undefined") {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

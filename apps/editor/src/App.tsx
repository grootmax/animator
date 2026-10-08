import React, { useState } from "react";
import { Toolbar } from "./components/Toolbar.js";
import type { ExportPreset, ExportState } from "./types/export.js";

export interface AppProps {
  onStartRender?: (
    preset: ExportPreset,
    updateProgress: (pct: number) => void,
  ) => Promise<void>;
  projectName?: string;
}

export function App({
  onStartRender,
  projectName = "Launch Title Motion",
}: AppProps) {
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
    progress: 0,
  });
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(
    null,
  );

  const handleExportPreset = async (preset: ExportPreset) => {
    setLastExportMessage(null);
    setExportState({
      status: "rendering",
      progress: 0,
      currentPreset: preset,
    });

    if (onStartRender) {
      try {
        await onStartRender(preset, (progress) => {
          setExportState((prev) => ({
            ...prev,
            status: "rendering",
            progress,
          }));
        });
        setExportState({
          status: "completed",
          progress: 100,
          currentPreset: preset,
        });
        setLastExportMessage(`Successfully exported ${preset.label}!`);
      } catch (err) {
        setExportState({
          status: "error",
          progress: 0,
          currentPreset: preset,
          error: err instanceof Error ? err.message : "Export failed",
        });
      }
      return;
    }

    // Default fast rendering simulation if no custom handler provided
    const steps = [15, 35, 60, 85, 100];
    for (const pct of steps) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      setExportState({
        status: "rendering",
        progress: pct,
        currentPreset: preset,
      });
    }

    setExportState({
      status: "completed",
      progress: 100,
      currentPreset: preset,
    });
    setLastExportMessage(`Successfully rendered and exported ${preset.label}!`);

    // Reset status back to idle after completion notification
    setTimeout(() => {
      setExportState((prev) =>
        prev.status === "completed" ? { ...prev, status: "idle" } : prev,
      );
    }, 3000);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#11111b",
        color: "#cdd6f4",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Toolbar
        exportState={exportState}
        onExportPreset={handleExportPreset}
        projectName={projectName}
      />

      {/* Main Canvas / Editor Body */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "24px",
        }}
      >
        {lastExportMessage && (
          <div
            data-testid="export-toast-notification"
            style={{
              position: "absolute",
              top: "20px",
              backgroundColor: "#a6e3a1",
              color: "#11111b",
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{lastExportMessage}</span>
          </div>
        )}

        <div
          style={{
            width: "480px",
            height: "480px",
            backgroundColor: "#181825",
            border: "2px dashed #45475a",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "#313244",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#89b4fa",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <span style={{ fontSize: "16px", fontWeight: 600 }}>
            Skottie Animation Canvas
          </span>
          <span style={{ fontSize: "12px", color: "#a6adc8" }}>
            Use the top right toolbar to select video export format presets.
          </span>
        </div>
      </main>
    </div>
  );
}

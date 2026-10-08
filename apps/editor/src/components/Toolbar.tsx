import React, { useState } from "react";
import {
  DEFAULT_EXPORT_PRESET,
  type ExportPreset,
  type ExportState,
} from "../types/export.js";
import { ExportPopover } from "./ExportPopover.js";

export interface ToolbarProps {
  exportState: ExportState;
  onExportPreset: (preset: ExportPreset) => void;
  projectName?: string;
}

export function Toolbar({
  exportState,
  onExportPreset,
  projectName = "Untitled Animation",
}: ToolbarProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const defaultPreset = DEFAULT_EXPORT_PRESET;
  const selectedPreset = exportState.currentPreset || defaultPreset;

  const isRendering = exportState.status === "rendering";

  return (
    <header
      data-testid="main-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "52px",
        padding: "0 16px",
        backgroundColor: "#181825",
        borderBottom: "1px solid #313244",
        color: "#cdd6f4",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Left: Branding & Project Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontWeight: 700,
            fontSize: "15px",
            color: "#89b4fa",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Animator</span>
        </div>
        <span style={{ color: "#45475a" }}>|</span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#bac2de",
            maxWidth: "200px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {projectName}
        </span>
      </div>

      {/* Right: Consolidated Unified Split-Button Export Control */}
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <div
          data-testid="export-split-button"
          style={{
            display: "inline-flex",
            alignItems: "stretch",
            borderRadius: "6px",
            backgroundColor: isRendering ? "#45475a" : "#89b4fa",
            color: isRendering ? "#a6adc8" : "#11111b",
            overflow: "hidden",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
            transition: "background-color 0.2s ease",
          }}
        >
          {/* Primary Action Button or Progress Indicator */}
          <button
            type="button"
            disabled={isRendering}
            onClick={() => {
              if (isRendering) return;
              onExportPreset(selectedPreset);
            }}
            data-testid="export-primary-button"
            aria-label={
              isRendering
                ? `Rendering export ${exportState.progress}%`
                : `Quick export ${selectedPreset.label}`
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              border: "none",
              backgroundColor: "transparent",
              color: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isRendering ? "not-allowed" : "pointer",
            }}
          >
            {isRendering ? (
              <>
                {/* Progress Spinner */}
                <svg
                  data-testid="export-progress-spinner"
                  style={{
                    animation: "spin 1s linear infinite",
                    width: "14px",
                    height: "14px",
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                  />
                  <path
                    d="M12 2 a 10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeLinecap="round"
                  />
                </svg>
                <span data-testid="export-progress-text">
                  Rendering {exportState.progress}%
                </span>
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export ({selectedPreset.label})</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div
            style={{
              width: "1px",
              backgroundColor: isRendering ? "#585b70" : "#74c7ec",
            }}
          />

          {/* Dropdown Popover Arrow Trigger */}
          <button
            type="button"
            disabled={isRendering}
            onClick={() => {
              if (isRendering) return;
              setIsPopoverOpen(!isPopoverOpen);
            }}
            data-testid="export-arrow-trigger"
            aria-label="Export options menu"
            aria-expanded={isPopoverOpen}
            aria-haspopup="menu"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 8px",
              border: "none",
              backgroundColor: "transparent",
              color: "inherit",
              cursor: isRendering ? "not-allowed" : "pointer",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: isPopoverOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Popover Dropdown */}
        <ExportPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          onSelectPreset={onExportPreset}
          disabled={isRendering}
        />
      </div>

      {/* Global Spin animation keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
}

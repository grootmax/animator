import React, { useEffect, useRef } from "react";
import { EXPORT_PRESETS, type ExportPreset } from "../types/export.js";

export interface ExportPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: ExportPreset) => void;
  disabled?: boolean;
}

export function ExportPopover({
  isOpen,
  onClose,
  onSelectPreset,
  disabled = false,
}: ExportPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const videoPresets = EXPORT_PRESETS.filter((p) =>
    ["mp4", "webm", "gif"].includes(p.format),
  );
  const staticPresets = EXPORT_PRESETS.filter((p) =>
    ["svg", "lottie"].includes(p.format),
  );

  return (
    <div
      ref={popoverRef}
      role="menu"
      aria-label="Export options"
      data-testid="export-popover"
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: "8px",
        width: "280px",
        backgroundColor: "#1e1e2e",
        border: "1px solid #313244",
        borderRadius: "8px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        padding: "8px 0",
        color: "#cdd6f4",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "13px",
      }}
    >
      <div
        style={{
          padding: "4px 12px 6px 12px",
          borderBottom: "1px solid #313244",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#a6adc8",
          }}
        >
          Quick Video Presets
        </span>
      </div>

      <div style={{ padding: "4px 0" }}>
        {videoPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onSelectPreset(preset);
              onClose();
            }}
            data-testid={`preset-${preset.id}`}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              border: "none",
              backgroundColor: "transparent",
              color: disabled ? "#6c7086" : "#cdd6f4",
              cursor: disabled ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!disabled) e.currentTarget.style.backgroundColor = "#313244";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>{preset.label}</span>
                {preset.badge && (
                  <span
                    style={{
                      fontSize: "10px",
                      backgroundColor: "#89b4fa",
                      color: "#11111b",
                      padding: "1px 5px",
                      borderRadius: "4px",
                      fontWeight: 700,
                    }}
                  >
                    {preset.badge}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: disabled ? "#6c7086" : "#a6adc8",
                  marginTop: "2px",
                }}
              >
                {preset.description}
              </div>
            </div>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor:
                  preset.format === "mp4"
                    ? "#313244"
                    : preset.format === "webm"
                      ? "#45475a"
                      : "#585b70",
                color: "#cdd6f4",
              }}
            >
              {preset.format}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          padding: "6px 12px 4px 12px",
          borderTop: "1px solid #313244",
          marginTop: "4px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#a6adc8",
          }}
        >
          Vector & Code
        </span>
      </div>

      <div style={{ padding: "4px 0" }}>
        {staticPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onSelectPreset(preset);
              onClose();
            }}
            data-testid={`preset-${preset.id}`}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              border: "none",
              backgroundColor: "transparent",
              color: disabled ? "#6c7086" : "#cdd6f4",
              cursor: disabled ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!disabled) e.currentTarget.style.backgroundColor = "#313244";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{preset.label}</div>
              <div
                style={{
                  fontSize: "11px",
                  color: disabled ? "#6c7086" : "#a6adc8",
                  marginTop: "2px",
                }}
              >
                {preset.description}
              </div>
            </div>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: "#313244",
                color: "#cdd6f4",
              }}
            >
              {preset.format}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

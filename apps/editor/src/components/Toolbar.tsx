import type React from "react";

export interface ToolbarProps {
  onOpenVideoExport: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  isLocked?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenVideoExport,
  onExportSVG,
  onExportJSON,
  isLocked = false,
}) => {
  return (
    <header className="toolbar" style={styles.toolbar}>
      <div className="toolbar-title" style={styles.titleContainer}>
        <span style={styles.brand}>Animator</span>
      </div>
      <div className="toolbar-actions" style={styles.actionsContainer}>
        <button
          type="button"
          onClick={onExportSVG}
          disabled={isLocked}
          style={
            isLocked
              ? { ...styles.button, ...styles.disabledButton }
              : styles.button
          }
          className="btn-export-svg"
        >
          Export SVG
        </button>
        <button
          type="button"
          onClick={onExportJSON}
          disabled={isLocked}
          style={
            isLocked
              ? { ...styles.button, ...styles.disabledButton }
              : styles.button
          }
          className="btn-export-json"
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={onOpenVideoExport}
          disabled={isLocked}
          style={
            isLocked
              ? { ...styles.primaryButton, ...styles.disabledButton }
              : styles.primaryButton
          }
          className="btn-export-video"
          aria-label="Export Video"
        >
          <MovieIcon />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};

const MovieIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ marginRight: 6, verticalAlign: "middle" }}
  >
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    backgroundColor: "#1e1e2e",
    color: "#ffffff",
    borderBottom: "1px solid #313244",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  brand: {
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  actionsContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  button: {
    padding: "8px 14px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    backgroundColor: "#313244",
    color: "#cdd6f4",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
    transition: "all 0.2s ease",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#89b4fa",
    color: "#11111b",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    transition: "all 0.2s ease",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};

import type React from "react";

interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string | number;
  headerActions?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  isExpanded,
  onToggle,
  children,
  badge,
  headerActions,
}: CollapsibleSectionProps) {
  const sectionId = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const headerId = `header-${sectionId}`;

  return (
    <div
      className={`panel-section ${isExpanded ? "expanded" : "collapsed"}`}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: isExpanded ? 1 : "0 0 auto",
        minHeight: 0,
        borderBottom: "1px solid #2d3748",
      }}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={isExpanded}
        aria-controls={sectionId}
        onClick={onToggle}
        className="section-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          backgroundColor: "#1a202c",
          cursor: "pointer",
          userSelect: "none",
          fontWeight: 600,
          color: "#e2e8f0",
          fontSize: "13px",
          letterSpacing: "0.02em",
          border: "none",
          borderBottom: isExpanded ? "1px solid #2d3748" : "none",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              fontSize: "12px",
            }}
            aria-hidden="true"
          >
            ▶
          </span>
          <span>{title}</span>
          {badge !== undefined && (
            <span
              className="badge"
              style={{
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "10px",
                backgroundColor: "#2d3748",
                color: "#a0aec0",
                fontWeight: 500,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {headerActions && (
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {headerActions}
          </span>
        )}
      </button>

      {isExpanded && (
        <div
          id={sectionId}
          aria-labelledby={headerId}
          className="section-content"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
            backgroundColor: "#171923",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

import type React from "react";
import { useState } from "react";
import { useEditorStore } from "../context/EditorContext.js";
import type { ThemeParam } from "../types.js";

export function ThemePanel() {
  const { doc, updateThemeParam, addThemeParam, removeThemeParam } =
    useEditorStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"color" | "text" | "number">("color");
  const [newValue, setNewValue] = useState("");

  const paramsList = Object.values(doc.params);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    const formattedKey = newKey.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    let initialVal: string | number = newValue;
    if (newType === "number") {
      initialVal = Number(newValue) || 0;
    } else if (newType === "color" && !newValue.startsWith("#")) {
      initialVal = "#3182CE";
    }

    const paramObj: ThemeParam = {
      id: `param-${Date.now()}`,
      key: formattedKey,
      label: newLabel.trim() || formattedKey,
      type: newType,
      value: initialVal,
    };

    addThemeParam(paramObj);
    setNewKey("");
    setNewLabel("");
    setNewValue("");
    setShowAddForm(false);
  };

  return (
    <div
      className="theme-panel-body"
      data-testid="theme-panel"
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#a0aec0",
            textTransform: "uppercase",
          }}
        >
          Theme Variables
        </span>
        <button
          type="button"
          data-testid="add-param-button"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: "4px 8px",
            backgroundColor: "#2b6cb0",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showAddForm ? "Cancel" : "+ Add Variable"}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "10px",
            backgroundColor: "#2d3748",
            borderRadius: "6px",
            border: "1px solid #4a5568",
          }}
        >
          <div>
            <label
              htmlFor="param-key-input"
              style={{ fontSize: "10px", color: "#a0aec0", display: "block" }}
            >
              Key (e.g. accent)
            </label>
            <input
              id="param-key-input"
              type="text"
              required
              aria-label="Parameter Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. brandColor"
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: "12px",
                backgroundColor: "#1a202c",
                color: "#fff",
                border: "1px solid #4a5568",
                borderRadius: "4px",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="param-label-input"
              style={{ fontSize: "10px", color: "#a0aec0", display: "block" }}
            >
              Label
            </label>
            <input
              id="param-label-input"
              type="text"
              aria-label="Parameter Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Brand Color"
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: "12px",
                backgroundColor: "#1a202c",
                color: "#fff",
                border: "1px solid #4a5568",
                borderRadius: "4px",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <div>
              <label
                htmlFor="param-type-select"
                style={{ fontSize: "10px", color: "#a0aec0", display: "block" }}
              >
                Type
              </label>
              <select
                id="param-type-select"
                aria-label="Parameter Type"
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as "color" | "text" | "number")
                }
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: "12px",
                  backgroundColor: "#1a202c",
                  color: "#fff",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                }}
              >
                <option value="color">Color</option>
                <option value="text">Text</option>
                <option value="number">Number</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="param-val-input"
                style={{ fontSize: "10px", color: "#a0aec0", display: "block" }}
              >
                Initial Value
              </label>
              <input
                id="param-val-input"
                type="text"
                aria-label="Initial Value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={newType === "color" ? "#3182CE" : "Value"}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: "12px",
                  backgroundColor: "#1a202c",
                  color: "#fff",
                  border: "1px solid #4a5568",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              marginTop: "4px",
              padding: "6px",
              backgroundColor: "#38a169",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Create Parameter
          </button>
        </form>
      )}

      {paramsList.length === 0 ? (
        <div
          style={{
            fontSize: "12px",
            color: "#a0aec0",
            fontStyle: "italic",
            textAlign: "center",
            padding: "12px",
          }}
        >
          No theme parameters defined yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {paramsList.map((param) => (
            <div
              key={param.key}
              data-testid={`theme-param-${param.key}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                padding: "10px",
                backgroundColor: "#2d3748",
                borderRadius: "6px",
                border: "1px solid #3a4556",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#edf2f7",
                    }}
                  >
                    {param.label}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#319795",
                      marginLeft: "6px",
                    }}
                  >
                    {`{{${param.key}}}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeThemeParam(param.key)}
                  aria-label={`Remove ${param.key}`}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "#e53e3e",
                    cursor: "pointer",
                    fontSize: "12px",
                    padding: "0 4px",
                  }}
                >
                  ✕
                </button>
              </div>

              {param.type === "color" && (
                <div
                  style={{ display: "flex", gap: "6px", alignItems: "center" }}
                >
                  <input
                    type="color"
                    aria-label={`${param.label} Color Picker`}
                    value={
                      String(param.value).startsWith("#")
                        ? String(param.value)
                        : "#FF5A5F"
                    }
                    onChange={(e) =>
                      updateThemeParam(param.key, e.target.value)
                    }
                    style={{
                      width: "28px",
                      height: "28px",
                      padding: 0,
                      border: "1px solid #4a5568",
                      borderRadius: "4px",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                    }}
                  />
                  <input
                    type="text"
                    aria-label={`${param.label} Hex Value`}
                    value={String(param.value)}
                    onChange={(e) =>
                      updateThemeParam(param.key, e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      backgroundColor: "#1a202c",
                      border: "1px solid #4a5568",
                      borderRadius: "4px",
                      color: "#ffffff",
                      fontSize: "12px",
                    }}
                  />
                </div>
              )}

              {param.type === "text" && (
                <input
                  type="text"
                  aria-label={`${param.label} Value`}
                  value={String(param.value)}
                  onChange={(e) => updateThemeParam(param.key, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    backgroundColor: "#1a202c",
                    border: "1px solid #4a5568",
                    borderRadius: "4px",
                    color: "#ffffff",
                    fontSize: "12px",
                  }}
                />
              )}

              {param.type === "number" && (
                <input
                  type="number"
                  aria-label={`${param.label} Value`}
                  value={Number(param.value) || 0}
                  onChange={(e) =>
                    updateThemeParam(param.key, Number(e.target.value))
                  }
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    backgroundColor: "#1a202c",
                    border: "1px solid #4a5568",
                    borderRadius: "4px",
                    color: "#ffffff",
                    fontSize: "12px",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

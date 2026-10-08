import type { Param, ParamType } from "@animator/core";
import { useState } from "react";

interface ParamsTabProps {
  params: Record<string, Param>;
  onSetParam: (name: string, param: Param | null) => void;
  onAddParam: (name: string, param: Param) => void;
  onRemoveParam: (name: string) => void;
}

export function ParamsTab({
  params,
  onSetParam,
  onAddParam,
  onRemoveParam,
}: ParamsTabProps) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<ParamType>("color");
  const [newValue, setNewValue] = useState("#38BDF8");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;

    onAddParam(trimmedKey, {
      type: newType,
      value: newType === "number" ? Number(newValue) || 0 : newValue,
      label: newLabel.trim() || trimmedKey,
    });

    setNewKey("");
    setNewLabel("");
    setNewValue("#38BDF8");
  };

  const paramEntries = Object.entries(params);

  return (
    <div className="params-panel">
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 12,
          }}
        >
          Theme Parameters
        </h3>

        {paramEntries.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              fontStyle: "italic",
              marginBottom: 16,
            }}
          >
            No theme parameters defined yet.
          </div>
        ) : (
          paramEntries.map(([key, param]) => (
            <div key={key} className="param-card">
              <div className="param-header">
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span className="param-name">{param.label || key}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    {`{{${key}}}`} · {param.type}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={() => onRemoveParam(key)}
                  aria-label={`Remove ${key}`}
                >
                  Delete
                </button>
              </div>

              <div className="form-group" style={{ marginBottom: 8 }}>
                <label htmlFor={`param-value-${key}`} className="form-label">
                  Value
                </label>
                {param.type === "color" ? (
                  <div className="color-picker-row">
                    <input
                      type="color"
                      className="color-input-swatch"
                      value={
                        String(param.value).startsWith("#")
                          ? String(param.value)
                          : "#000000"
                      }
                      onChange={(e) =>
                        onSetParam(key, { ...param, value: e.target.value })
                      }
                    />
                    <input
                      id={`param-value-${key}`}
                      type="text"
                      className="form-input"
                      value={String(param.value)}
                      onChange={(e) =>
                        onSetParam(key, { ...param, value: e.target.value })
                      }
                    />
                  </div>
                ) : param.type === "number" ? (
                  <input
                    id={`param-value-${key}`}
                    type="number"
                    className="form-input"
                    value={Number(param.value) || 0}
                    onChange={(e) =>
                      onSetParam(key, {
                        ...param,
                        value: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                ) : (
                  <input
                    id={`param-value-${key}`}
                    type="text"
                    className="form-input"
                    value={String(param.value)}
                    onChange={(e) =>
                      onSetParam(key, { ...param, value: e.target.value })
                    }
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: "1px solid #334155", paddingTop: 16 }}>
        <h4
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#f8fafc",
            marginBottom: 12,
          }}
        >
          Add Theme Parameter
        </h4>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label htmlFor="new-param-key" className="form-label">
              Param Key (ID)
            </label>
            <input
              id="new-param-key"
              type="text"
              className="form-input"
              placeholder="e.g. primaryColor"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-param-label" className="form-label">
              Label
            </label>
            <input
              id="new-param-label"
              type="text"
              className="form-input"
              placeholder="e.g. Primary Color"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-param-type" className="form-label">
              Type
            </label>
            <select
              id="new-param-type"
              className="form-select"
              value={newType}
              onChange={(e) => {
                const t = e.target.value as ParamType;
                setNewType(t);
                if (t === "color" && !newValue.startsWith("#"))
                  setNewValue("#38BDF8");
                if (t === "number" && Number.isNaN(Number(newValue)))
                  setNewValue("10");
              }}
            >
              <option value="color">Color</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="new-param-val" className="form-label">
              Initial Value
            </label>
            {newType === "color" ? (
              <div className="color-picker-row">
                <input
                  type="color"
                  className="color-input-swatch"
                  value={newValue.startsWith("#") ? newValue : "#38BDF8"}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <input
                  id="new-param-val"
                  type="text"
                  className="form-input"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
            ) : (
              <input
                id="new-param-val"
                type={newType === "number" ? "number" : "text"}
                className="form-input"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
          >
            + Add Parameter
          </button>
        </form>
      </div>
    </div>
  );
}

import fs from "node:fs";
import { createDefaultDoc } from "@animator/core";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "./App.js";

describe("App Visual Verification", () => {
  test("renders full editor layout and writes html snapshot for verification", () => {
    const { container } = render(<App />);
    const html = container.innerHTML;

    expect(html).toContain("Animator Studio");
    expect(html).toContain("right-sidebar");
    expect(html).toContain("canvas-viewport");
    expect(html).toContain("Inspector");
    expect(html).toContain("Params");

    // Write HTML preview file for verification
    const pageHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; height: 100vh; }
    .toolbar { height: 48px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; }
    .editor-layout { display: flex; height: calc(100vh - 48px); }
    .left-panel { width: 220px; background: #1e293b; border-right: 1px solid #334155; }
    .canvas-container { flex: 1; background: #090d16; display: flex; align-items: center; justify-content: center; }
    .canvas-viewport { position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border-radius: 8px; }
    .right-sidebar { width: 280px; min-width: 280px; max-width: 280px; background: #1e293b; border-left: 1px solid #334155; display: flex; flex-direction: column; }
    .tab-bar { display: flex; border-bottom: 1px solid #334155; background: #0f172a; }
    .tab-btn { flex: 1; padding: 12px; background: none; border: none; color: #94a3b8; font-size: 13px; font-weight: 600; }
    .tab-btn.active { color: #38bdf8; border-bottom: 2px solid #38bdf8; background: #1e293b; }
    .tab-content { padding: 16px; flex: 1; overflow-y: auto; }
    .btn { background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 6px 12px; border-radius: 4px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
    .form-input { width: 100%; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 8px 10px; border-radius: 4px; }
    .layer-item { display: flex; justify-content: space-between; padding: 8px 12px; border-radius: 4px; margin-bottom: 4px; background: transparent; }
    .layer-item.selected { background: #0284c7; color: #fff; }
    .layer-badge { font-size: 10px; text-transform: uppercase; padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,0.15); }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

    fs.writeFileSync("/tmp/editor_preview.html", pageHtml, "utf-8");
  });
});

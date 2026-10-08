import React, { useState } from "react";
import { type PlatformAdapter, getPlatformAdapter } from "./platform/index.js";

export interface AppProps {
  adapter?: PlatformAdapter;
}

export function App({ adapter }: AppProps) {
  const activeAdapter = adapter ?? getPlatformAdapter();
  const [status, setStatus] = useState<string>("Ready");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [processedResult, setProcessedResult] = useState<string | null>(null);

  const envName = activeAdapter.getEnvironment();

  const handleOpenFile = async () => {
    setStatus("Opening file...");
    try {
      const content = await activeAdapter.openFile();
      if (content !== null) {
        setFileContent(content);
        setStatus("File opened successfully");
      } else {
        setStatus("Open file canceled or empty");
      }
    } catch (err) {
      setStatus(
        `Error opening file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleSaveFile = async () => {
    setStatus("Saving project...");
    try {
      const payload = JSON.stringify({
        project: "Animator Project",
        timestamp: Date.now(),
        content: fileContent ?? "Empty scene",
      });
      const success = await activeAdapter.saveFile(payload, "project.json");
      if (success) {
        setStatus("Project saved successfully");
      } else {
        setStatus("Failed to save project");
      }
    } catch (err) {
      setStatus(
        `Error saving file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleExportSvg = async () => {
    setStatus("Exporting SVG...");
    try {
      const svgPayload = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#4285f4"/></svg>`;
      const success = await activeAdapter.exportSvg(svgPayload, "export.svg");
      if (success) {
        setStatus("SVG exported successfully");
      } else {
        setStatus("Failed to export SVG");
      }
    } catch (err) {
      setStatus(
        `Error exporting SVG: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleRunWorkerTask = () => {
    setStatus("Running background task via WorkerAdapter...");
    // Create worker task via abstraction adapter (fallback in-memory sync execution in browser)
    const workerAdapter = activeAdapter.createWorker<
      { input: string },
      { output: string }
    >((msg) => ({
      output: `Processed: ${msg.input.toUpperCase()}`,
    }));

    workerAdapter.onMessage((data) => {
      setProcessedResult(data.output);
      setStatus("Background task completed");
      workerAdapter.terminate();
    });

    workerAdapter.postMessage({
      input: fileContent ?? "Sample Motion Doc payload",
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Animator Editor</h1>
      <p data-testid="env-info">
        Environment Mode: <strong>{envName}</strong>
      </p>
      <p data-testid="status-message">Status: {status}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button type="button" onClick={handleOpenFile}>
          Open File
        </button>
        <button type="button" onClick={handleSaveFile}>
          Save File
        </button>
        <button type="button" onClick={handleExportSvg}>
          Export SVG
        </button>
        <button type="button" onClick={handleRunWorkerTask}>
          Run Background Task
        </button>
      </div>

      {fileContent && (
        <div style={{ marginTop: 10 }}>
          <h3>File Content:</h3>
          <pre data-testid="file-content">{fileContent}</pre>
        </div>
      )}

      {processedResult && (
        <div style={{ marginTop: 10 }}>
          <h3>Worker Output:</h3>
          <pre data-testid="worker-output">{processedResult}</pre>
        </div>
      )}
    </div>
  );
}

export default App;

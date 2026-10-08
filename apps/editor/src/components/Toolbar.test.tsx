// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EXPORT_PRESET, type ExportState } from "../types/export.js";
import { Toolbar } from "./Toolbar.js";

describe("Toolbar component", () => {
  afterEach(() => {
    cleanup();
  });
  const idleState: ExportState = {
    status: "idle",
    progress: 0,
  };

  it("renders the unified split-button export trigger", () => {
    render(<Toolbar exportState={idleState} onExportPreset={() => {}} />);

    expect(screen.getByTestId("main-toolbar")).not.toBeNull();
    expect(screen.getByTestId("export-split-button")).not.toBeNull();
    expect(screen.getByTestId("export-primary-button")).not.toBeNull();
    expect(screen.getByTestId("export-arrow-trigger")).not.toBeNull();
  });

  it("toggles popover dropdown menu when arrow trigger is clicked", () => {
    render(<Toolbar exportState={idleState} onExportPreset={() => {}} />);

    expect(screen.queryByTestId("export-popover")).toBeNull();

    const arrowTrigger = screen.getByTestId("export-arrow-trigger");
    fireEvent.click(arrowTrigger);

    expect(screen.getByTestId("export-popover")).not.toBeNull();
  });

  it("triggers export when primary action button is clicked", () => {
    const handleExportPreset = vi.fn();
    render(
      <Toolbar exportState={idleState} onExportPreset={handleExportPreset} />,
    );

    fireEvent.click(screen.getByTestId("export-primary-button"));

    expect(handleExportPreset).toHaveBeenCalledTimes(1);
    expect(handleExportPreset.mock.calls[0]?.[0]).toEqual(
      DEFAULT_EXPORT_PRESET,
    );
  });

  it("displays progress percentage inside toolbar button during rendering", () => {
    const renderingState: ExportState = {
      status: "rendering",
      progress: 45,
      currentPreset: DEFAULT_EXPORT_PRESET,
    };

    render(<Toolbar exportState={renderingState} onExportPreset={() => {}} />);

    expect(screen.getByTestId("export-progress-spinner")).not.toBeNull();
    expect(screen.getByTestId("export-progress-text").textContent).toBe(
      "Rendering 45%",
    );
  });

  it("disables export actions while video render process is active", () => {
    const handleExportPreset = vi.fn();
    const renderingState: ExportState = {
      status: "rendering",
      progress: 50,
      currentPreset: DEFAULT_EXPORT_PRESET,
    };

    render(
      <Toolbar
        exportState={renderingState}
        onExportPreset={handleExportPreset}
      />,
    );

    const primaryBtn = screen.getByTestId("export-primary-button");
    const arrowTrigger = screen.getByTestId("export-arrow-trigger");

    expect(primaryBtn.hasAttribute("disabled")).toBe(true);
    expect(arrowTrigger.hasAttribute("disabled")).toBe(true);

    fireEvent.click(primaryBtn);
    fireEvent.click(arrowTrigger);

    expect(handleExportPreset).not.toHaveBeenCalled();
    expect(screen.queryByTestId("export-popover")).toBeNull();
  });
});

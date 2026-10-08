// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportPopover } from "./ExportPopover.js";

describe("ExportPopover component", () => {
  afterEach(() => {
    cleanup();
  });
  it("does not render when isOpen is false", () => {
    render(
      <ExportPopover
        isOpen={false}
        onClose={() => {}}
        onSelectPreset={() => {}}
      />,
    );
    expect(screen.queryByTestId("export-popover")).toBeNull();
  });

  it("renders presets for MP4, WebM, GIF, SVG, and Lottie when open", () => {
    render(
      <ExportPopover
        isOpen={true}
        onClose={() => {}}
        onSelectPreset={() => {}}
      />,
    );

    expect(screen.getByTestId("export-popover")).not.toBeNull();
    expect(screen.getByTestId("preset-mp4-1080p")).not.toBeNull();
    expect(screen.getByTestId("preset-mp4-720p")).not.toBeNull();
    expect(screen.getByTestId("preset-webm-1080p")).not.toBeNull();
    expect(screen.getByTestId("preset-webm-720p")).not.toBeNull();
    expect(screen.getByTestId("preset-gif-720p")).not.toBeNull();
    expect(screen.getByTestId("preset-svg-static")).not.toBeNull();
  });

  it("calls onSelectPreset and onClose when a preset is clicked", () => {
    const handleSelectPreset = vi.fn();
    const handleClose = vi.fn();

    render(
      <ExportPopover
        isOpen={true}
        onClose={handleClose}
        onSelectPreset={handleSelectPreset}
      />,
    );

    fireEvent.click(screen.getByTestId("preset-webm-1080p"));

    expect(handleSelectPreset).toHaveBeenCalledTimes(1);
    expect(handleSelectPreset.mock.calls[0]?.[0]).toMatchObject({
      id: "webm-1080p",
      format: "webm",
      resolution: "1080p",
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("closes when Escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <ExportPopover
        isOpen={true}
        onClose={handleClose}
        onSelectPreset={() => {}}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking outside the popover boundary", () => {
    const handleClose = vi.fn();

    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <ExportPopover
          isOpen={true}
          onClose={handleClose}
          onSelectPreset={() => {}}
        />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("outside-element"));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("disables preset selections when disabled is true", () => {
    const handleSelectPreset = vi.fn();

    render(
      <ExportPopover
        isOpen={true}
        onClose={() => {}}
        onSelectPreset={handleSelectPreset}
        disabled={true}
      />,
    );

    const mp4Btn = screen.getByTestId("preset-mp4-1080p");
    expect(mp4Btn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(mp4Btn);
    expect(handleSelectPreset).not.toHaveBeenCalled();
  });
});

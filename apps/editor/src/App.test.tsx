// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

describe("App editor integration scenarios", () => {
  afterEach(() => {
    cleanup();
  });
  it("Scenario: Fast Preset Export - selects MP4 1080p preset from popover and starts rendering instantly", async () => {
    let progressCallback: ((pct: number) => void) | null = null;
    const mockStartRender = vi.fn((_preset, updateProgress) => {
      progressCallback = updateProgress;
      return new Promise<void>(() => {}); // keeps rendering in progress
    });

    render(<App onStartRender={mockStartRender} />);

    // Open export popover menu from toolbar
    const arrowTrigger = screen.getByTestId("export-arrow-trigger");
    fireEvent.click(arrowTrigger);

    // Click MP4 1080p preset
    const mp4PresetItem = screen.getByTestId("preset-mp4-1080p");
    fireEvent.click(mp4PresetItem);

    // Verify popover closed and render started immediately without modal overlay
    expect(screen.queryByTestId("export-popover")).toBeNull();
    expect(mockStartRender).toHaveBeenCalledTimes(1);
    expect(mockStartRender.mock.calls[0]?.[0]).toMatchObject({
      id: "mp4-1080p",
      format: "mp4",
      resolution: "1080p",
    });

    // Simulate progress updates
    if (progressCallback) {
      act(() => {
        (progressCallback as (pct: number) => void)(30);
      });
    }

    // Verify inline progress indicator displays progress percent inside toolbar button
    expect(screen.getByTestId("export-progress-text").textContent).toBe(
      "Rendering 30%",
    );

    // Verify toolbar export actions are disabled while rendering
    expect(
      screen.getByTestId("export-primary-button").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("Scenario: WebM Quick Share - selects WebM preset item and shows progress inside toolbar button", async () => {
    let progressCallback: ((pct: number) => void) | null = null;
    const mockStartRender = vi.fn((_preset, updateProgress) => {
      progressCallback = updateProgress;
      return new Promise<void>(() => {});
    });

    render(<App onStartRender={mockStartRender} />);

    // Open popover
    fireEvent.click(screen.getByTestId("export-arrow-trigger"));

    // Click WebM 720p preset item
    fireEvent.click(screen.getByTestId("preset-webm-720p"));

    // Verify render initiated
    expect(mockStartRender).toHaveBeenCalledTimes(1);
    expect(mockStartRender.mock.calls[0]?.[0]).toMatchObject({
      id: "webm-720p",
      format: "webm",
      resolution: "720p",
    });

    // Simulate progress
    if (progressCallback) {
      act(() => {
        (progressCallback as (pct: number) => void)(75);
      });
    }

    // Verify progress text in toolbar
    expect(screen.getByTestId("export-progress-text").textContent).toBe(
      "Rendering 75%",
    );
  });
});

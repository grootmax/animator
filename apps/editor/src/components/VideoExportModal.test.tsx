// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../main.js";
import { Toolbar } from "./Toolbar.js";
import { VideoExportModal } from "./VideoExportModal.js";

afterEach(() => {
  cleanup();
});

describe("Toolbar", () => {
  test("renders Export Video button with movie icon alongside SVG and JSON export buttons", () => {
    render(
      <Toolbar
        onOpenVideoExport={vi.fn()}
        onExportSVG={vi.fn()}
        onExportJSON={vi.fn()}
      />,
    );

    const videoBtn = screen.getByRole("button", { name: /export video/i });
    expect(videoBtn).toBeDefined();
    expect(screen.getByText("Export SVG")).toBeDefined();
    expect(screen.getByText("Export JSON")).toBeDefined();

    // Verify SVG icon exists inside Export Video button
    const svgIcon = videoBtn.querySelector("svg");
    expect(svgIcon).not.toBeNull();
  });

  test("locks toolbar buttons when isLocked is true", () => {
    render(
      <Toolbar
        onOpenVideoExport={vi.fn()}
        onExportSVG={vi.fn()}
        onExportJSON={vi.fn()}
        isLocked={true}
      />,
    );

    const videoBtn = screen.getByRole("button", { name: /export video/i });
    const svgBtn = screen.getByRole("button", { name: /export svg/i });
    const jsonBtn = screen.getByRole("button", { name: /export json/i });

    expect((videoBtn as HTMLButtonElement).disabled).toBe(true);
    expect((svgBtn as HTMLButtonElement).disabled).toBe(true);
    expect((jsonBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("VideoExportModal", () => {
  test("does not render when isOpen is false", () => {
    const { container } = render(
      <VideoExportModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders format, resolution, frame rate, and calculated total frames when open", () => {
    render(
      <VideoExportModal
        isOpen={true}
        onClose={vi.fn()}
        projectDurationSec={4.0}
        initialWidth={1920}
        initialHeight={1080}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /export video/i }),
    ).toBeDefined();
    expect(screen.getByText("MP4")).toBeDefined();
    expect(screen.getByText("WebM")).toBeDefined();
    expect(screen.getByText("GIF")).toBeDefined();

    // Calculated total frames for 4.0s @ default 60 fps = 240 frames
    expect(screen.getByText(/240 frames/i)).toBeDefined();
  });

  test("updates format selection and displays GIF loop count when GIF is selected", () => {
    render(<VideoExportModal isOpen={true} onClose={vi.fn()} />);

    const gifButton = screen.getByRole("button", { name: "GIF" });
    fireEvent.click(gifButton);

    expect(screen.getByText(/gif loop count/i)).toBeDefined();
  });

  test("updates resolution dimensions when preset buttons are clicked", () => {
    render(
      <VideoExportModal
        isOpen={true}
        onClose={vi.fn()}
        initialWidth={1920}
        initialHeight={1080}
      />,
    );

    const widthInput = screen.getByLabelText(
      /custom width/i,
    ) as HTMLInputElement;
    const heightInput = screen.getByLabelText(
      /custom height/i,
    ) as HTMLInputElement;

    expect(widthInput.value).toBe("1920");
    expect(heightInput.value).toBe("1080");

    // Click 720p preset
    const preset720p = screen.getByRole("button", { name: "720p" });
    fireEvent.click(preset720p);

    expect(widthInput.value).toBe("1280");
    expect(heightInput.value).toBe("720");

    // Click 4K preset
    const preset4K = screen.getByRole("button", { name: "4K" });
    fireEvent.click(preset4K);

    expect(widthInput.value).toBe("3840");
    expect(heightInput.value).toBe("2160");
  });

  test("displays immediate inline validation errors for invalid custom dimensions (<128 or >3840)", () => {
    render(<VideoExportModal isOpen={true} onClose={vi.fn()} />);

    const widthInput = screen.getByLabelText(/custom width/i);
    const startExportBtn = screen.getByRole("button", {
      name: /start export/i,
    }) as HTMLButtonElement;

    // Set invalid width < 128
    fireEvent.change(widthInput, { target: { value: "100" } });

    expect(
      screen.getByText(/width must be between 128 and 3840px/i),
    ).toBeDefined();
    expect(startExportBtn.disabled).toBe(true);

    // Set invalid width > 3840
    fireEvent.change(widthInput, { target: { value: "4000" } });
    expect(
      screen.getByText(/width must be between 128 and 3840px/i),
    ).toBeDefined();
    expect(startExportBtn.disabled).toBe(true);

    // Set valid width
    fireEvent.change(widthInput, { target: { value: "1920" } });
    expect(screen.queryByText(/width must be between/i)).toBeNull();
    expect(startExportBtn.disabled).toBe(false);
  });

  test("recalculates total frames when fps option is changed", () => {
    render(
      <VideoExportModal
        isOpen={true}
        onClose={vi.fn()}
        projectDurationSec={5.0}
      />,
    );

    // 5s @ 60 fps = 300 frames
    expect(screen.getByText(/300 frames/i)).toBeDefined();

    // Change to 24 fps -> 5s @ 24 fps = 120 frames
    const fps24Btn = screen.getByRole("button", { name: "24 fps" });
    fireEvent.click(fps24Btn);

    expect(screen.getByText(/120 frames/i)).toBeDefined();
  });

  test("shows active progress feedback during export execution and allows cancellation", () => {
    vi.useFakeTimers();
    const onCancelExport = vi.fn();
    const onClose = vi.fn();

    render(
      <VideoExportModal
        isOpen={true}
        onClose={onClose}
        projectDurationSec={2.0}
        onCancelExport={onCancelExport}
      />,
    );

    const startExportBtn = screen.getByRole("button", {
      name: /start export/i,
    });
    fireEvent.click(startExportBtn);

    // Check progress section is visible
    expect(screen.getByText(/rendering frame/i)).toBeDefined();

    // Advance timer slightly
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Click Cancel Export
    const cancelBtn = screen.getByRole("button", { name: /cancel export/i });
    fireEvent.click(cancelBtn);

    expect(onCancelExport).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe("App Integration", () => {
  test("opens modal from toolbar button and locks state during active export", () => {
    vi.useFakeTimers();

    render(<App initialDurationSec={3.0} />);

    const exportVideoBtn = screen.getByRole("button", {
      name: /export video/i,
    });
    fireEvent.click(exportVideoBtn);

    // Modal opens
    expect(
      screen.getByRole("heading", { name: /export video/i }),
    ).toBeDefined();

    // Start export
    const startExportBtn = screen.getByRole("button", {
      name: /start export/i,
    });
    fireEvent.click(startExportBtn);

    // Toolbar buttons locked
    expect((exportVideoBtn as HTMLButtonElement).disabled).toBe(true);

    vi.useRealTimers();
  });
});

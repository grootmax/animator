import { createDefaultDoc } from "@animator/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RightSidebar } from "./RightSidebar.js";

describe("RightSidebar Component", () => {
  afterEach(() => {
    cleanup();
  });

  const defaultDoc = createDefaultDoc();
  const sampleLayer = defaultDoc.layers[0] ?? null;

  test("renders 280px container with Inspector and Params tabs", () => {
    const onTabChange = vi.fn();
    const onUpdateLayer = vi.fn();
    const onSetParam = vi.fn();
    const onAddParam = vi.fn();
    const onRemoveParam = vi.fn();

    const { container } = render(
      <RightSidebar
        activeTab="inspector"
        onTabChange={onTabChange}
        selectedLayer={sampleLayer}
        onUpdateLayer={onUpdateLayer}
        params={defaultDoc.params}
        onSetParam={onSetParam}
        onAddParam={onAddParam}
        onRemoveParam={onRemoveParam}
      />,
    );

    const sidebarEl = container.querySelector("aside.right-sidebar");
    expect(sidebarEl).not.toBeNull();
    expect(sidebarEl?.getAttribute("style")).toContain("width: 280px");

    expect(screen.getByText("Inspector")).not.toBeNull();
    expect(screen.getByText(/Params \(\d+\)/)).not.toBeNull();
  });

  test("shows empty state message in Inspector tab when no layer is selected", () => {
    render(
      <RightSidebar
        activeTab="inspector"
        onTabChange={vi.fn()}
        selectedLayer={null}
        onUpdateLayer={vi.fn()}
        params={defaultDoc.params}
        onSetParam={vi.fn()}
        onAddParam={vi.fn()}
        onRemoveParam={vi.fn()}
      />,
    );

    expect(screen.getByText("No Layer Selected")).not.toBeNull();
    expect(
      screen.getByText(
        "Select a layer from the panel or canvas to inspect and edit properties.",
      ),
    ).not.toBeNull();
  });

  test("renders layer attributes and updates layer when inputs change", () => {
    const onUpdateLayer = vi.fn();

    const { container } = render(
      <RightSidebar
        activeTab="inspector"
        onTabChange={vi.fn()}
        selectedLayer={sampleLayer}
        onUpdateLayer={onUpdateLayer}
        params={defaultDoc.params}
        onSetParam={vi.fn()}
        onAddParam={vi.fn()}
        onRemoveParam={vi.fn()}
      />,
    );

    const nameInput = container.querySelector(
      "#layer-name",
    ) as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe(sampleLayer?.name || sampleLayer?.id);

    fireEvent.change(nameInput, { target: { value: "Updated Card Rect" } });
    expect(onUpdateLayer).toHaveBeenCalledWith(sampleLayer?.id, {
      name: "Updated Card Rect",
    });

    const posXInput = container.querySelector("#pos-x") as HTMLInputElement;
    expect(posXInput).not.toBeNull();
    fireEvent.change(posXInput, { target: { value: "650" } });
    expect(onUpdateLayer).toHaveBeenCalledWith(sampleLayer?.id, {
      position: [650, 540],
    });
  });

  test("switches tabs and displays Params tab with theme parameter controls", () => {
    const onTabChange = vi.fn();
    const onRemoveParam = vi.fn();

    render(
      <RightSidebar
        activeTab="params"
        onTabChange={onTabChange}
        selectedLayer={sampleLayer}
        onUpdateLayer={vi.fn()}
        params={defaultDoc.params}
        onSetParam={vi.fn()}
        onAddParam={vi.fn()}
        onRemoveParam={onRemoveParam}
      />,
    );

    expect(screen.getByText("Theme Parameters")).not.toBeNull();
    expect(screen.getByText("Accent Color")).not.toBeNull();
    expect(screen.getByText("Headline Text")).not.toBeNull();

    const deleteBtn = screen.getByLabelText("Remove accent");
    fireEvent.click(deleteBtn);
    expect(onRemoveParam).toHaveBeenCalledWith("accent");
  });
});

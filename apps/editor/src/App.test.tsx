import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "./App.js";

describe("Stacked Inspector and Theme Sidebar in App.tsx", () => {
  afterEach(() => {
    cleanup();
  });
  test("renders split right sidebar with Layer Inspector and Theme Parameters sections", () => {
    render(<App />);

    const sidebar = screen.getByTestId("right-sidebar");
    expect(sidebar).not.toBeNull();

    expect(screen.getByText("Layer Inspector")).not.toBeNull();
    expect(screen.getByText("Theme Parameters")).not.toBeNull();
  });

  test("headers toggle expand or collapse sections cleanly", () => {
    render(<App />);

    const inspectorHeader = screen
      .getByText("Layer Inspector")
      .closest(".section-header");
    const themeHeader = screen
      .getByText("Theme Parameters")
      .closest(".section-header");

    expect(inspectorHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(themeHeader?.getAttribute("aria-expanded")).toBe("true");

    // Collapse Layer Inspector
    if (inspectorHeader) fireEvent.click(inspectorHeader);
    expect(inspectorHeader?.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("layer-inspector-panel")).toBeNull();

    // Theme Parameters should still be expanded
    expect(themeHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("theme-panel")).not.toBeNull();

    // Expand Layer Inspector again
    if (inspectorHeader) fireEvent.click(inspectorHeader);
    expect(inspectorHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("layer-inspector-panel")).not.toBeNull();
  });

  test("displays selected layer properties with input controls", () => {
    render(<App />);

    // Initially title-layer is selected
    expect(screen.getByLabelText("Layer Name")).not.toBeNull();
    expect(
      (screen.getByLabelText("Layer Name") as HTMLInputElement).value,
    ).toBe("Headline Text");

    // Check transform inputs
    const posX = screen.getByLabelText("Position X") as HTMLInputElement;
    const posY = screen.getByLabelText("Position Y") as HTMLInputElement;
    expect(posX.value).toBe("540");
    expect(posY.value).toBe("480");

    // Edit transform input
    fireEvent.change(posX, { target: { value: "600" } });
    expect(posX.value).toBe("600");
  });

  test("displays empty state in inspector when no layer is selected", () => {
    render(<App />);

    // Deselect all layers by clicking None button
    const deselectButton = screen.getByRole("button", {
      name: "None (Deselect All)",
    });
    fireEvent.click(deselectButton);

    expect(screen.getByTestId("inspector-empty-state")).not.toBeNull();
    expect(screen.getByText("No Layer Selected")).not.toBeNull();
  });

  test("displays theme parameters with store-backed controls", () => {
    render(<App />);

    const themePanel = screen.getByTestId("theme-panel");
    expect(themePanel).not.toBeNull();

    // Verify existing theme parameters
    expect(screen.getByText("Accent Color")).not.toBeNull();
    expect(screen.getByText("Main Headline")).not.toBeNull();

    // Edit theme parameter
    const headlineInput = screen.getByLabelText(
      "Main Headline Value",
    ) as HTMLInputElement;
    expect(headlineInput.value).toBe("Ship faster");

    fireEvent.change(headlineInput, { target: { value: "Build smarter" } });
    expect(headlineInput.value).toBe("Build smarter");
  });

  test("selecting a layer updates the inspector without affecting theme parameters section", () => {
    render(<App />);

    // Tweak theme parameter first
    const headlineInput = screen.getByLabelText(
      "Main Headline Value",
    ) as HTMLInputElement;
    fireEvent.change(headlineInput, {
      target: { value: "Custom Theme Headline" },
    });

    // Select second layer (Accent Badge Shape)
    const badgeLayerBtn = screen.getAllByRole("button", {
      name: "Accent Badge Shape",
    })[0];
    if (badgeLayerBtn) fireEvent.click(badgeLayerBtn);

    // Layer Inspector should now show Accent Badge Shape properties
    expect(
      (screen.getByLabelText("Layer Name") as HTMLInputElement).value,
    ).toBe("Accent Badge Shape");

    // Theme Parameters section should remain unchanged with modified value
    const updatedHeadlineInput = screen.getByLabelText(
      "Main Headline Value",
    ) as HTMLInputElement;
    expect(updatedHeadlineInput.value).toBe("Custom Theme Headline");
  });

  test("supports adding and removing theme parameters", () => {
    render(<App />);

    // Click Add Variable
    const addBtn = screen.getByTestId("add-param-button");
    fireEvent.click(addBtn);

    // Fill form
    fireEvent.change(screen.getByLabelText("Parameter Key"), {
      target: { value: "primaryFont" },
    });
    fireEvent.change(screen.getByLabelText("Parameter Label"), {
      target: { value: "Primary Font" },
    });
    fireEvent.change(screen.getByLabelText("Parameter Type"), {
      target: { value: "text" },
    });
    fireEvent.change(screen.getByLabelText("Initial Value"), {
      target: { value: "Roboto" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Create Parameter" }));

    // Verify new theme parameter is displayed
    expect(screen.getByText("Primary Font")).not.toBeNull();
    expect(
      (screen.getByLabelText("Primary Font Value") as HTMLInputElement).value,
    ).toBe("Roboto");

    // Remove theme parameter
    const removeBtn = screen.getByRole("button", {
      name: "Remove primaryFont",
    });
    fireEvent.click(removeBtn);

    expect(screen.queryByText("Primary Font")).toBeNull();
  });
});

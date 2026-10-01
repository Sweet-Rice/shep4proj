// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ModelProviderSettingsView } from "./ModelProviderSettingsView.js";

describe("ModelProviderSettingsView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders provider radio options with Mock selected by default", () => {
    render(<ModelProviderSettingsView />);

    expect(screen.getByTestId("model-provider-settings")).toBeInTheDocument();
    expect(screen.getByTestId("provider-mock-radio")).toBeChecked();
    expect(screen.getByTestId("provider-qwen-radio")).not.toBeChecked();
    expect(screen.getByTestId("provider-jev-radio")).not.toBeChecked();
  });

  it("shows Qwen configuration inputs when Local Qwen is selected", async () => {
    const user = userEvent.setup();
    render(<ModelProviderSettingsView />);

    const qwenRadio = screen.getByTestId("provider-qwen-radio");
    await user.click(qwenRadio);

    expect(screen.getByTestId("qwen-settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("qwen-base-url-input")).toHaveValue("http://localhost:11434/v1");
    expect(screen.getByTestId("qwen-model-input")).toHaveValue("qwen2.5-coder");
  });

  it("shows Jev configuration inputs and validates required API key", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();

    render(<ModelProviderSettingsView onSaveSettings={handleSave} />);

    const jevRadio = screen.getByTestId("provider-jev-radio");
    await user.click(jevRadio);

    expect(screen.getByTestId("jev-settings-panel")).toBeInTheDocument();

    // Key is empty -> Save button disabled
    const saveBtn = screen.getByTestId("save-provider-settings-btn");
    expect(saveBtn).toBeDisabled();
    expect(screen.getByTestId("validation-errors")).toHaveTextContent(
      "Jev API key is required when Jev provider is selected.",
    );

    // Type API key
    const apiKeyInput = screen.getByTestId("jev-api-key-input");
    await user.type(apiKeyInput, "secret-key-456");

    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        activeProvider: "jev",
        jevApiKey: "secret-key-456",
      }),
    );
  });
});

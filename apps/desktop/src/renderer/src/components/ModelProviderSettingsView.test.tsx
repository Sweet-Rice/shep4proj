// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
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
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { HarnessSettingsView } from "./HarnessSettingsView.js";

describe("HarnessSettingsView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders stopped server status when disabled by default", () => {
    render(<HarnessSettingsView />);

    expect(screen.getByTestId("harness-settings-view")).toBeInTheDocument();
    expect(screen.getByTestId("harness-toggle-checkbox")).not.toBeChecked();
    expect(screen.getByTestId("server-status-text")).toHaveTextContent("Server Status: Stopped");
    expect(screen.queryByTestId("harness-details-panel")).not.toBeInTheDocument();
  });

  it("starts server and displays token, instructions, and exposed data list when enabled", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(<HarnessSettingsView onToggleServer={handleToggle} />);

    const toggleCheckbox = screen.getByTestId("harness-toggle-checkbox");
    await user.click(toggleCheckbox);

    expect(handleToggle).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("server-status-text")).toHaveTextContent(
      "Server Status: Running on http://127.0.0.1:3000",
    );
    expect(screen.getByTestId("harness-details-panel")).toBeInTheDocument();

    expect(screen.getByTestId("token-display-input")).toHaveValue("sample-session-token");
    expect(screen.getByTestId("exposed-data-list")).toBeInTheDocument();
  });

  it("allows copying session token to clipboard", async () => {
    const user = userEvent.setup();
    const handleCopy = vi.fn();

    render(
      <HarnessSettingsView
        initialSettings={{
          enabled: true,
          bindAddress: "127.0.0.1",
          port: 3000,
          sessionToken: "custom-token-xyz",
        }}
        onCopyToken={handleCopy}
      />,
    );

    const copyBtn = screen.getByTestId("copy-token-btn");
    await user.click(copyBtn);

    expect(handleCopy).toHaveBeenCalledWith("custom-token-xyz");
    expect(screen.getByTestId("copy-token-btn")).toHaveTextContent("Copied!");
  });
});

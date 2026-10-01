// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModelProviders } from "./useModelProviders.js";

describe("useModelProviders", () => {
  it("initializes with mock provider as default for CI and testing", () => {
    const { result } = renderHook(() => useModelProviders());

    expect(result.current.settings.activeProvider).toBe("mock");
    expect(result.current.isValid).toBe(true);
    expect(result.current.validationErrors).toHaveLength(0);
  });

  it("switches active provider and updates Qwen / Jev configuration", () => {
    const { result } = renderHook(() => useModelProviders());

    act(() => {
      result.current.setActiveProvider("qwen");
      result.current.updateQwenSettings("http://localhost:11434/v1", "qwen2.5-coder");
    });

    expect(result.current.settings.activeProvider).toBe("qwen");
    expect(result.current.settings.qwenBaseUrl).toBe("http://localhost:11434/v1");
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.setActiveProvider("jev");
      result.current.updateJevSettings("https://api.jev.ai/v1", "secret-key-123");
    });

    expect(result.current.settings.activeProvider).toBe("jev");
    expect(result.current.settings.jevApiKey).toBe("secret-key-123");
    expect(result.current.isValid).toBe(true);
  });

  it("validates empty Jev API key when Jev provider is selected", () => {
    const { result } = renderHook(() => useModelProviders());

    act(() => {
      result.current.setActiveProvider("jev");
      result.current.updateJevSettings("https://api.jev.ai/v1", "");
    });

    expect(result.current.isValid).toBe(false);
    expect(result.current.validationErrors).toContain(
      "Jev API key is required when Jev provider is selected.",
    );
  });
});

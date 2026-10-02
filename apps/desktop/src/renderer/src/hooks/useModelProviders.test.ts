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

  it("updates Qwen configuration", () => {
    const { result } = renderHook(() => useModelProviders());

    act(() => {
      result.current.setActiveProvider("qwen");
      result.current.updateQwenSettings("http://localhost:11434/v1", "qwen2.5-coder");
    });

    expect(result.current.settings.activeProvider).toBe("qwen");
    expect(result.current.settings.qwenBaseUrl).toBe("http://localhost:11434/v1");
    expect(result.current.settings.qwenModel).toBe("qwen2.5-coder");
    expect(result.current.isValid).toBe(true);
  });
});

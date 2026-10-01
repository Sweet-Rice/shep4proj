// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionWatches } from "./useSectionWatches.js";

describe("useSectionWatches", () => {
  it("initializes with provided watched section keys", () => {
    const { result } = renderHook(() => useSectionWatches(["CSC 1350-001"]));

    expect(result.current.isWatching("CSC 1350-001")).toBe(true);
    expect(result.current.isWatching("MATH 1550-001")).toBe(false);
    expect(result.current.watchCount).toBe(1);
  });

  it("toggles watch state on and off", () => {
    const { result } = renderHook(() => useSectionWatches());

    expect(result.current.isWatching("CSC 1350-001")).toBe(false);

    act(() => {
      result.current.toggleWatch("CSC 1350-001");
    });

    expect(result.current.isWatching("CSC 1350-001")).toBe(true);
    expect(result.current.watchCount).toBe(1);

    act(() => {
      result.current.toggleWatch("CSC 1350-001");
    });

    expect(result.current.isWatching("CSC 1350-001")).toBe(false);
    expect(result.current.watchCount).toBe(0);
  });

  it("adds and removes watch explicitly", () => {
    const { result } = renderHook(() => useSectionWatches());

    act(() => {
      result.current.addWatch("CSC 2250-001");
    });

    expect(result.current.isWatching("CSC 2250-001")).toBe(true);

    act(() => {
      result.current.removeWatch("CSC 2250-001");
    });

    expect(result.current.isWatching("CSC 2250-001")).toBe(false);
  });
});

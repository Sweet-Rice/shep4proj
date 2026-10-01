// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCompletedCourses } from "./useCompletedCourses.js";

const mockGet = vi.fn();
const mockSet = vi.fn();

describe("useCompletedCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined); // Default fallback to prevent 'undefined.catch' errors

    // Setup global window.jevschedule for tests
    (globalThis as any).window.jevschedule = {
      completed: {
        get: mockGet,
        set: mockSet,
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).window.jevschedule;
  });

  it("loads initial data from store", async () => {
    mockGet.mockResolvedValueOnce(["CSC 1350", "MATH 1550"]);

    const { result } = renderHook(() => useCompletedCourses());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.completed.has("CSC 1350")).toBe(true);
    expect(result.current.completed.has("MATH 1550")).toBe(true);
    expect(result.current.completed.has("CSC 1253")).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("toggles course completion and updates store", async () => {
    mockGet.mockResolvedValueOnce(["CSC 1350"]);
    mockSet.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCompletedCourses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Toggle a new course
    act(() => {
      result.current.toggleCourse("CSC 1253");
    });

    // Optimistic update
    expect(result.current.completed.has("CSC 1253")).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("CSC 1253", true);

    // Untoggle an existing course
    act(() => {
      result.current.toggleCourse("CSC 1350");
    });

    expect(result.current.completed.has("CSC 1350")).toBe(false);
    expect(mockSet).toHaveBeenCalledWith("CSC 1350", false);
  });

  it("rolls back optimistic update on IPC failure", async () => {
    mockGet.mockResolvedValueOnce(["CSC 1350"]);
    mockSet.mockRejectedValueOnce(new Error("IPC Error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useCompletedCourses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleCourse("CSC 1253");
      // Give the catch block a tick to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Should rollback
    expect(result.current.completed.has("CSC 1253")).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to toggle course completion:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("isCompleted helper works", async () => {
    mockGet.mockResolvedValueOnce(["CSC 1350"]);
    const { result } = renderHook(() => useCompletedCourses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isCompleted("CSC 1350")).toBe(true);
    expect(result.current.isCompleted("CSC 1253")).toBe(false);
  });
});

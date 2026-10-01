// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createCompletedStore, type CompletedStore } from "../../../main/store/completed.js";
import { openLocalDb, type LocalDb } from "../../../main/store/db.js";
import { useCompletedCourses } from "./useCompletedCourses.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("useCompletedCourses", () => {
  let db: LocalDb;
  let store: CompletedStore;

  beforeEach(() => {
    db = openLocalDb(":memory:");
    store = createCompletedStore(db);
    Object.assign(window, {
      jevschedule: {
        completed: {
          get: async () => store.getCompleted(),
          set: async (code: string, completed: boolean) => store.setCompleted(code, completed),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    db.close();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("reloads saved completions and removals from SQLite on remount", async () => {
    store.setCompleted("CSC 1350", true);
    const first = renderHook(() => useCompletedCourses());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => {
      await first.result.current.toggleCourse("MATH 1550");
    });
    await act(async () => {
      await first.result.current.toggleCourse("CSC 1350");
    });
    expect(store.getCompleted()).toEqual(["MATH 1550"]);
    first.unmount();
    const second = renderHook(() => useCompletedCourses());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect([...second.result.current.completed]).toEqual(["MATH 1550"]);
  });

  it("does not roll back a saved completion when StrictMode replays an updater", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.jevschedule.completed.set = async (code, completed) => {
      if (store.getCompleted().includes(code)) throw new Error("database became unavailable");
      store.setCompleted(code, completed);
    };
    const { result } = renderHook(() => useCompletedCourses(), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.toggleCourse("CSC 1350");
    });
    expect(store.getCompleted()).toEqual(["CSC 1350"]);
    expect([...result.current.completed]).toEqual(["CSC 1350"]);
  });

  it("keeps toggle completion unsettled until the store write settles", async () => {
    const write = deferred<void>();
    window.jevschedule.completed.set = () => write.promise;
    const { result } = renderHook(() => useCompletedCourses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let settled = false;
    await act(async () => {
      void result.current.toggleCourse("CSC 1350").then(() => {
        settled = true;
      });
    });
    expect(settled).toBe(false);
    await act(async () => {
      write.resolve();
    });
    expect(settled).toBe(true);
  });
});

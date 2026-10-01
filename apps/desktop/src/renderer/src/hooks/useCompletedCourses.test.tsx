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
  it("ignores same-course clicks until the pending write settles", async () => {
    const write = deferred<void>();
    window.jevschedule.completed.set = () => write.promise;
    const { result } = renderHook(() => useCompletedCourses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      void result.current.toggleCourse("CSC 1350");
    });
    await act(async () => {
      void result.current.toggleCourse("CSC 1350");
    });
    expect(result.current.completed.has("CSC 1350")).toBe(true);
    await act(async () => {
      write.reject(new Error("write failed"));
    });
    expect(result.current.completed.has("CSC 1350")).toBe(false);
    expect(store.getCompleted()).toEqual([]);
    expect(result.current.error?.message).toBe("write failed");
  });

  it("does not write before the initial store snapshot is available", async () => {
    const load = deferred<string[]>();
    window.jevschedule.completed.get = () => load.promise;
    const { result } = renderHook(() => useCompletedCourses());
    await act(async () => {
      await result.current.toggleCourse("CSC 1350");
    });
    expect(store.getCompleted()).toEqual([]);
    await act(async () => {
      load.resolve([]);
    });
    await act(async () => {
      await result.current.toggleCourse("CSC 1350");
    });
    expect(store.getCompleted()).toEqual(["CSC 1350"]);
    expect([...result.current.completed]).toEqual(["CSC 1350"]);
  });

  it.each([false, true])(
    "restores the saved state after a failed toggle from %s",
    async (initial) => {
      store.setCompleted("CSC 1350", initial);
      window.jevschedule.completed.set = async () => {
        throw new Error("cannot save");
      };
      const { result } = renderHook(() => useCompletedCourses());
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.toggleCourse("CSC 1350");
      });
      expect(result.current.completed.has("CSC 1350")).toBe(initial);
      expect(store.getCompleted()).toEqual(initial ? ["CSC 1350"] : []);
      expect(result.current.error?.message).toBe("cannot save");
    },
  );

  it("reports a failed initial load and does not overwrite unknown saved state", async () => {
    store.setCompleted("CSC 1350", true);
    window.jevschedule.completed.get = async () => {
      throw new Error("cannot load");
    };
    const { result } = renderHook(() => useCompletedCourses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("cannot load");
    await act(async () => {
      await result.current.toggleCourse("CSC 1350");
    });
    expect(store.getCompleted()).toEqual(["CSC 1350"]);
  });
});

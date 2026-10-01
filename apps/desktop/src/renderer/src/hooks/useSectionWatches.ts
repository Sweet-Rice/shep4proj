import { useCallback, useState } from "react";

export function useSectionWatches(initialWatchedKeys: string[] = []) {
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(() => new Set(initialWatchedKeys));

  const isWatching = useCallback(
    (sectionKey: string) => {
      return watchedKeys.has(sectionKey);
    },
    [watchedKeys],
  );

  const toggleWatch = useCallback((sectionKey: string) => {
    setWatchedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  const addWatch = useCallback((sectionKey: string) => {
    setWatchedKeys((prev) => {
      const next = new Set(prev);
      next.add(sectionKey);
      return next;
    });
  }, []);

  const removeWatch = useCallback((sectionKey: string) => {
    setWatchedKeys((prev) => {
      const next = new Set(prev);
      next.delete(sectionKey);
      return next;
    });
  }, []);

  return {
    watchedKeys,
    isWatching,
    toggleWatch,
    addWatch,
    removeWatch,
    watchCount: watchedKeys.size,
  };
}

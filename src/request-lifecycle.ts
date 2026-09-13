/**
 * React development mode briefly mounts, cleans up, and mounts again.
 * Deferring abort by one task lets that remount cancel the pending cleanup,
 * while real navigation still aborts the active request immediately afterward.
 */
export function scheduleAbort(
  controller: AbortController,
  isMounted: () => boolean,
) {
  const timer = setTimeout(() => {
    if (!isMounted()) controller.abort();
  }, 0);
  return () => clearTimeout(timer);
}

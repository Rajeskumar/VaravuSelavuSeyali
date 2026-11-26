/**
 * Turns "the focused route changed" into at most one analytics screen event. It only ever sees a route
 * NAME (never params, URLs or titles) and only reports names the app registered. Pure, so it is testable
 * without a navigator.
 */
export function createScreenTracker(
  screens: Record<string, string>,
  report: (screenId: string) => void,
) {
  let current: string | undefined;
  const emit = (name: string | undefined) => {
    if (!name || !Object.prototype.hasOwnProperty.call(screens, name)) return;
    try { report(screens[name]); } catch { /* analytics must never affect navigation */ }
  };
  return {
    /** First render of the container. */
    onReady(name: string | undefined) { current = name; emit(name); },
    /** Re-report the focused screen, e.g. when consent arrives after the first screen was shown. The client
     * ignores it when that screen was already reported. */
    replay(name: string | undefined) { emit(name); },
    /** Every state change; params-only changes keep the same name and are ignored. */
    onStateChange(name: string | undefined) {
      if (name === current) return;
      current = name;
      emit(name);
    },
  };
}

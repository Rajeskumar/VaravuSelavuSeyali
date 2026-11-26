import { useEffect, useState } from 'react';

/**
 * Tiny coordination point so two full-screen modals opened after sign-in never stack: a feature marks its
 * overlay busy (while it is checking whether it needs to show, and while it is on screen) and a core prompt that
 * can wait (the consent sheet) shows only once nothing is busy. Generic: ids are opaque strings.
 */
const busy = new Set<string>();
const listeners = new Set<() => void>();

export function setOverlayBusy(id: string, isBusy: boolean): void {
  const changed = isBusy ? !busy.has(id) : busy.has(id);
  if (!changed) return;
  if (isBusy) busy.add(id); else busy.delete(id);
  for (const l of listeners) { try { l(); } catch { /* a listener must not break the gate */ } }
}

export const isAnyOverlayBusy = (): boolean => busy.size > 0;

export function useOverlayBusy(): boolean {
  const [value, setValue] = useState(isAnyOverlayBusy());
  useEffect(() => {
    const sync = () => setValue(isAnyOverlayBusy());
    listeners.add(sync);
    sync();
    return () => { listeners.delete(sync); };
  }, []);
  return value;
}

/** Test helper. */
export function resetOverlayGateForTests(): void { busy.clear(); listeners.clear(); }

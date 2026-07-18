import { useEffect, useState } from 'react';

/** TS-ENT-1xx frontend plan: single canonical debounce implementation for
 * typeahead — the 3 pre-existing call sites (receipt scan, quick-log parse,
 * chat) each hand-roll a different delay (3000ms/1500ms/800ms); this one is
 * new and specific to entity-resolution typeahead (spec §8.1's 150ms), not a
 * refactor of those. */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

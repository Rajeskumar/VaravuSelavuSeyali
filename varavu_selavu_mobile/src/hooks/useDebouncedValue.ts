import { useEffect, useState } from 'react';

/** TS-ENT-1xx frontend plan: single canonical debounce implementation for
 * typeahead (spec §8.1's 150ms) — mirrors the web app's
 * varavu_selavu_ui/src/hooks/useDebouncedValue.ts. */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

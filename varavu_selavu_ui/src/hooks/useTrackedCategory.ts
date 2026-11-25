import { useCallback, useEffect, useRef } from 'react';
import { CategorySuggestion, suggestCategory } from '../api/expenses';
import { analytics } from '../analytics/browser';
import { observe, safeFailure } from '../analytics/operations';

/** Cache one in-flight request per form revision. The input stays in the form and is
 * never forwarded to analytics. A different revision invalidates stale responses. */
export function useTrackedCategory(input: string, active = true) {
  const revision = useRef({ input, active });
  const current = useRef<{ revision: typeof revision.current; promise: Promise<CategorySuggestion | undefined> } | undefined>(undefined);
  if (revision.current.input !== input || revision.current.active !== active) revision.current = { input, active };
  useEffect(() => () => { current.current = undefined; }, []);
  return useCallback((valid: (result: CategorySuggestion) => boolean = result => !!result?.subcategory) => {
    const marker = revision.current;
    if (!marker.active || !marker.input) return Promise.resolve(undefined);
    if (current.current?.revision === marker) return current.current.promise;
    const latest = () => current.current?.revision === marker && revision.current === marker;
    const promise = observe(() => suggestCategory(marker.input), (result, op) => {
      if (!latest()) return;
      if (valid(result)) analytics.track('category_suggestion_completed', {}, op);
      else analytics.track('category_suggestion_failed', { outcome: 'failure', error_code: 'validation' }, op);
    }, (error, op) => {
      if (latest()) analytics.track('category_suggestion_failed', safeFailure(error), op);
    }).then(result => latest() && valid(result) ? result : undefined, () => undefined);
    current.current = { revision: marker, promise };
    return promise;
  }, []);
}

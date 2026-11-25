import { renderHook } from '@testing-library/react';
import { useTrackedCategory } from './useTrackedCategory';
import { CategorySuggestion, suggestCategory } from '../api/expenses';
import { analytics } from '../analytics/browser';

jest.mock('../api/expenses', () => ({ suggestCategory: jest.fn() }));
jest.mock('../analytics/browser', () => ({ analytics: {
  beginOperation: () => ({ generation: 0, token: {} }),
  track: jest.fn(),
} }));

test('shares a form revision request and discards a response that arrives after input changes', async () => {
  let finishOld!: (value: CategorySuggestion) => void;
  const old = { main_category: 'Other', subcategory: 'General' };
  const latest = { main_category: 'Food', subcategory: 'Groceries' };
  const request = suggestCategory as jest.Mock;
  request.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(latest);
  const { result, rerender } = renderHook(({ input }) => useTrackedCategory(input), { initialProps: { input: 'old' } });
  const first = result.current();
  expect(result.current()).toBe(first);
  rerender({ input: 'new' });
  await expect(result.current()).resolves.toEqual(latest);
  finishOld(old);
  await expect(first).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
  expect(analytics.track).toHaveBeenCalledTimes(1);
  expect(analytics.track).toHaveBeenCalledWith('category_suggestion_completed', {}, expect.anything());
});

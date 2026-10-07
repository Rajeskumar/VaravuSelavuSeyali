import { writeExpenseDraft, readExpenseDraft, clearExpenseDraft, DRAFT_TTL_MS, EXPENSE_DRAFT_KEY } from './expenseDraft';
afterEach(() => { sessionStorage.clear(); jest.restoreAllMocks(); });
test('round-trips the full draft for its account, including receipt and split fields', () => {
  const draft = { amount: '12.34', who: 'group', scannedItems: [{ item_name: 'Milk' }], splitValue: { type: 'exact', entries: [{ member_id: 'a', amount: 12.34 }] }, unknownOutcome: true };
  expect(writeExpenseDraft('a', draft)).toBe(true);
  expect(readExpenseDraft('a')).toEqual(draft);
});
test('expires and clears drafts, and rejects a different account', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  writeExpenseDraft('a', { description: 'private' });
  expect(readExpenseDraft('b')).toBeNull();
  expect(sessionStorage.getItem(EXPENSE_DRAFT_KEY)).toBeNull();
  writeExpenseDraft('a', { description: 'private' });
  jest.spyOn(Date, 'now').mockReturnValue(1000 + DRAFT_TTL_MS);
  expect(readExpenseDraft('a')).toBeNull();
});
test('handles corrupt or blocked storage without breaking expense entry', () => {
  sessionStorage.setItem(EXPENSE_DRAFT_KEY, '{bad'); expect(readExpenseDraft('a')).toBeNull();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(writeExpenseDraft('a', {})).toBe(false);
  expect(() => clearExpenseDraft()).not.toThrow();
});


test('a late save completion cannot erase a newer draft or another account draft', () => {
  const old = { description: 'Old', unknownOutcome: true };
  writeExpenseDraft('a', { description: 'New' });
  clearExpenseDraft('a', old);
  expect(readExpenseDraft('a')).toEqual({ description: 'New' });
  writeExpenseDraft('b', { description: 'Private' });
  clearExpenseDraft('a', old);
  expect(readExpenseDraft('b')).toEqual({ description: 'Private' });
});

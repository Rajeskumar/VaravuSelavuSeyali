import * as SecureStore from 'expo-secure-store';
import { writeExpenseDraft, readExpenseDraft, clearExpenseDraft, DRAFT_TTL_MS } from './expenseDraft';
jest.mock('expo-secure-store', () => {
  const values = new Map();
  return { getItemAsync: jest.fn(async (key) => values.get(key) || null), setItemAsync: jest.fn(async (key, value) => { values.set(key, value); }), deleteItemAsync: jest.fn(async (key) => { values.delete(key); }) };
});
afterEach(async () => { await clearExpenseDraft(); jest.restoreAllMocks(); });
test('securely restores the full account draft including unknown save outcomes', async () => {
  const draft = { amt: '1.23', desc: 'Private', payers: [{ member_id: 'a' }], scannedItems: [{ item_name: 'Milk' }], unknownOutcome: true };
  await writeExpenseDraft('a', draft);
  expect(await readExpenseDraft('a')).toEqual(draft);
  expect(await readExpenseDraft('b')).toBeNull();
  expect(await readExpenseDraft('a')).toBeNull();
});
test('expires old drafts', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  await writeExpenseDraft('a', {});
  jest.spyOn(Date, 'now').mockReturnValue(1000 + DRAFT_TTL_MS);
  expect(await readExpenseDraft('a')).toBeNull();
});
test('a slow pending write cannot resurrect a discarded draft', async () => {
  let release!: () => void;
  const original = (SecureStore.setItemAsync as jest.Mock).getMockImplementation()!;
  (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return original(key, value);
  });
  const write = writeExpenseDraft('a', { desc: 'Pending' });
  await Promise.resolve();
  const clear = clearExpenseDraft(); release();
  await Promise.all([write, clear]);
  expect(await readExpenseDraft('a')).toBeNull();
});


test('late save cleanup never removes a newer draft or another account draft', async () => {
  const pending = { desc: 'Old', unknownOutcome: true };
  const newer = { desc: 'New' };
  const write = writeExpenseDraft('a', newer);
  const clear = clearExpenseDraft('a', pending);
  await Promise.all([write, clear]);
  expect(await readExpenseDraft('a')).toEqual(newer);
  await writeExpenseDraft('b', { desc: 'Private' });
  await clearExpenseDraft('a', pending);
  expect(await readExpenseDraft('b')).toEqual({ desc: 'Private' });
});

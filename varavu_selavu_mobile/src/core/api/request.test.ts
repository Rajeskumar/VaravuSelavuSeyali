import { boundedFetch, requestTimeout, RequestError } from './request';

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('uses separate ordinary and AI/receipt timeout budgets', () => {
  expect(requestTimeout('/api/v1/expenses')).toBe(30_000);
  expect(requestTimeout('/api/v1/analysis/chat')).toBe(120_000);
  expect(requestTimeout('/api/v1/ingest/receipt/parse')).toBe(120_000);
});

test('a timed-out write is not replayed and has an unknown outcome', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
  })) as typeof fetch;
  const pending = boundedFetch('/expenses', { method: 'POST' }, 100);
  const result = pending.catch((error) => error);
  jest.advanceTimersByTime(100);
  expect(await result).toMatchObject({ outcomeUnknown: true, message: expect.stringMatching(/timed out/) });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('honours caller cancellation and cleans up its timeout', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
  })) as typeof fetch;
  const controller = new AbortController();
  const pending = boundedFetch('/models', { signal: controller.signal }, 100);
  const result = pending.catch((error) => error);
  controller.abort();
  expect(await result).toMatchObject({ message: 'Request cancelled.', outcomeUnknown: false });
  expect(jest.getTimerCount()).toBe(0);
});

test('does not retry server errors or a dropped response after a financial write', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 503 });
  await expect(boundedFetch('/expenses', { method: 'POST' }, 100)).rejects.toMatchObject({ status: 503, outcomeUnknown: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(boundedFetch('/expenses', { method: 'POST' }, 100)).rejects.toBeInstanceOf(RequestError);
  expect(fetch).toHaveBeenCalledTimes(1);
});


test('a response that stalls after its headers still times out during JSON consumption', async () => {
  jest.useFakeTimers();
  let signal!: AbortSignal;
  global.fetch = jest.fn(async (_url, options) => {
    signal = options!.signal!;
    return { status: 200, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted body')));
    }) };
  }) as unknown as typeof fetch;
  const response = await boundedFetch('/expenses', { method: 'POST' }, 100);
  const result = response.json().catch((error) => error);
  jest.advanceTimersByTime(100);
  expect(await result).toMatchObject({ outcomeUnknown: true, message: expect.stringMatching(/timed out/) });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

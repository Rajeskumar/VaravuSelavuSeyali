/** Bounded requests; network failures never automatically replay a write. */
export class RequestError extends Error {
  constructor(message: string, public outcomeUnknown = false, public status?: number) {
    super(message);
    this.name = 'RequestError';
  }
}
export const SESSION_ENDED_KEY = 'vs_session_ended';
export function requestTimeout(path: string) {
  return /\/analysis\/chat|\/ingest\/receipt/.test(path) ? 120_000 : 30_000;
}
export async function boundedFetch(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  const deadline = Date.now() + timeoutMs;
  const write = !['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase());
  // The same deadline covers headers AND body consumption, without buffering or cloning exports.
  const run = async <T,>(operation: () => Promise<T>): Promise<T> => {
    const cancel = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', cancel, { once: true });
    let timedOut = Date.now() >= deadline;
    if (timedOut) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, deadline - Date.now()));
    try {
      if (controller.signal.aborted) throw new Error('Aborted');
      return await operation();
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (callerSignal?.aborted && !timedOut) throw new RequestError(write
        ? 'Request stopped. Its outcome is unknown; check your records before retrying.'
        : 'Request cancelled.', write);
      throw new RequestError(timedOut
        ? (write ? 'The request timed out. Check your records before saving again.' : 'The request timed out. Please try again.')
        : (write ? 'Connection lost. Check your records before saving again.' : 'Cannot reach the server. Check your connection and try again.'), write);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', cancel);
    }
  };
  const response = await run(() => fetch(url, { ...options, signal: controller.signal }));
  if (response.status >= 500) throw new RequestError(write
    ? 'The server could not confirm the result. Check your records before retrying.'
    : 'The server is temporarily unavailable. Please try again.', write, response.status);
  const readers = response as unknown as Record<string, () => Promise<unknown>>;
  for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData']) {
    if (typeof readers[method] === 'function') {
      const read = readers[method].bind(response);
      readers[method] = () => run(read);
    }
  }
  return response;
}

import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { uploadReceipt } from './expenses';

const mockApiFetch = jest.fn();
jest.mock('../../../core/api/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('../../ask/utils/aiConsent', () => ({
  ensureAiConsent: jest.fn(async () => true),
  hasAiConsent: jest.fn(async () => true),
}));

// Mirrors React Native's FormData patched by Expo SDK 57's installFormDataPatch:
// non-Blob objects stay as objects in `_parts` (rather than being coerced to "[object Object]")
// and are yielded as-is by `entries()` for `convertFormDataAsync`.
class NativeFormData {
  _parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this._parts.push([String(name), value]);
  }
  entries() {
    return this._parts[Symbol.iterator]();
  }
}

const RealFormData = global.FormData;

beforeEach(() => {
  global.FormData = NativeFormData as unknown as typeof FormData;
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ header: {}, items: [] }) });
});

afterAll(() => {
  global.FormData = RealFormData;
});

describe('uploadReceipt', () => {
  it('builds a FormData part accepted by Expo SDK 57 winter/fetch', async () => {
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await uploadReceipt({ uri: 'file:///tmp/receipt.jpg', bytes: jpegHeader }, 'tok');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/v1/ingest/receipt/parse?allow_ai=true');
    expect(init.body).toBeInstanceOf(NativeFormData);

    const { body, boundary } = await convertFormDataAsync(init.body, 'test-boundary');
    expect(boundary).toBe('test-boundary');
    const text = Buffer.from(body).toString('latin1');
    expect(text).toContain('content-disposition: form-data; name="file"; filename="receipt.jpg"');
    expect(text).toContain('content-type: image/jpeg');
    const idx = body.findIndex((b, i) => b === 0xff && body[i + 1] === 0xd8 && body[i + 2] === 0xff && body[i + 3] === 0xe0);
    expect(idx).toBeGreaterThan(-1);
  });
});

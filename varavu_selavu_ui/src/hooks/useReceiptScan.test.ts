import { act, renderHook } from '@testing-library/react';
import heic2any from 'heic2any';
import { useReceiptScan } from './useReceiptScan';
import { parseReceipt } from '../api/expenses';
import { ensureAiConsent } from '../utils/aiConsent';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../api/expenses', () => ({ parseReceipt: jest.fn() }));
jest.mock('../utils/aiConsent', () => ({ ensureAiConsent: jest.fn() }));

const pick = (file: File) => ({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);

beforeEach(() => {
  jest.clearAllMocks();
  (heic2any as jest.Mock).mockResolvedValue(new Blob(['converted'], { type: 'image/png' }));
  (ensureAiConsent as jest.Mock).mockResolvedValue(true);
  (parseReceipt as jest.Mock).mockResolvedValue({ items: [] });
});

test('ordinary receipts stay unchanged and do not invoke the HEIC converter', async () => {
  const { result } = renderHook(() => useReceiptScan());
  for (const type of ['image/png', 'image/jpeg', 'application/pdf']) {
    const file = new File(['receipt'], 'receipt', { type });
    await act(async () => { await result.current.handleFileChange(pick(file)); });
    expect(result.current.file).toBe(file);
  }
  expect(heic2any).not.toHaveBeenCalled();
});

test('a HEIC camera capture waits for conversion, then parses the PNG once', async () => {
  const onAutoParse = jest.fn();
  const { result } = renderHook(() => useReceiptScan({ onAutoParse }));
  const file = new File(['heic'], 'receipt.heic', { type: 'image/heic' });
  const event = pick(file);
  result.current.cameraInputRef.current = event.target;
  await act(async () => { await result.current.handleFileChange(event); });
  expect(heic2any).toHaveBeenCalledWith({ blob: file, toType: 'image/png' });
  expect(result.current.file).toMatchObject({ name: 'receipt.png', type: 'image/png' });
  expect(parseReceipt).toHaveBeenCalledTimes(1);
  expect(parseReceipt).toHaveBeenCalledWith(result.current.file);
  expect(ensureAiConsent).toHaveBeenCalledTimes(1);
  expect(onAutoParse).toHaveBeenCalledWith({ items: [] });
});

test('a converter failure leaves the scan recoverable without sending a receipt', async () => {
  (heic2any as jest.Mock).mockRejectedValue(new Error('Conversion failed'));
  const { result } = renderHook(() => useReceiptScan());
  await act(async () => {
    await result.current.handleFileChange(pick(new File(['heic'], 'receipt.heic', { type: 'image/heic' })));
  });
  expect(result.current.error).toBe('Unsupported image format');
  expect(result.current.converting).toBe(false);
  expect(parseReceipt).not.toHaveBeenCalled();
});

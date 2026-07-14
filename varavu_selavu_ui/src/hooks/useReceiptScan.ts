import { useRef, useState } from 'react';
import heic2any from 'heic2any';
import { parseReceipt, ReceiptParseDraft } from '../api/expenses';

// OpenAI only accepts PNG or JPEG. Any other image format (e.g. HEIC) must be
// converted in-browser before sending to the backend.
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

export interface UseReceiptScanOptions {
  /** Fired after a camera capture auto-parses (mirrors AddExpenseForm's pre-existing behavior). */
  onAutoParse?: (draft: ReceiptParseDraft) => void;
}

/**
 * Shared receipt-capture pipeline (extracted from AddExpenseForm, TS-DES-2xx): pick/capture a
 * file, convert unsupported image formats to PNG in-browser via heic2any/canvas, then send to
 * parseReceipt(). Callers own what to do with the resulting draft — this hook only owns file
 * capture, format conversion, and the parse call, so QuickCaptureSheet's scan button doesn't
 * duplicate the OCR/conversion wiring AddExpenseForm already has.
 */
export function useReceiptScan(options: UseReceiptScanOptions = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  const parseFile = async (target?: File): Promise<ReceiptParseDraft | null> => {
    const f = target || file;
    if (!f) return null;
    try {
      setParsing(true);
      setError(null);
      return await parseReceipt(f);
    } catch {
      setError('Failed to parse receipt');
      return null;
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      setError('Unsupported file type');
      setFile(null);
      return;
    }
    setConverting(true);
    let processed: File = f;
    if (f.type.startsWith('image/') && !SUPPORTED_IMAGE_TYPES.includes(f.type)) {
      try {
        // HEIC is handled explicitly via heic2any: many browsers don't support
        // createImageBitmap for HEIC images captured on iOS devices.
        if (f.type === 'image/heic' || f.name.toLowerCase().endsWith('.heic')) {
          const heicBlob = await heic2any({ blob: f, toType: 'image/png' });
          processed = new File([heicBlob as BlobPart], f.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
        } else {
          const img = await createImageBitmap(f);
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          if (!blob) {
            setError('Failed to process image');
            setConverting(false);
            return;
          }
          processed = new File([blob], f.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
        }
      } catch {
        setError('Unsupported image format');
        setConverting(false);
        return;
      }
    }
    setFile(processed);
    setConverting(false);
    // Auto-parse when capturing from camera.
    if (e.target === cameraInputRef.current) {
      const res = await parseFile(processed);
      if (res) options.onAutoParse?.(res);
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
  };

  return {
    file,
    setFile,
    converting,
    parsing,
    error,
    isMobile,
    fileInputRef,
    cameraInputRef,
    handleFileChange,
    parseFile,
    reset,
  };
}

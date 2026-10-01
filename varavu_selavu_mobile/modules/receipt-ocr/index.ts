import { requireOptionalNativeModule } from 'expo';

export interface NativeOcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Baseline angle in radians (image coordinates: positive slopes down). */
  angle: number;
  confidence: number;
}

export interface NativeOcrResult {
  lines: NativeOcrLine[];
  /** iOS reports the upright image size; Android leaves it to the caller. */
  width?: number;
  height?: number;
}

interface ReceiptOcrNative {
  recognize(uri: string): Promise<NativeOcrResult>;
}

// Optional so a binary built before this module existed (or web) gets null, not a crash.
const native = requireOptionalNativeModule<ReceiptOcrNative>('ReceiptOcr');

export const isAvailable = native != null;

export function recognize(uri: string): Promise<NativeOcrResult> {
  if (!native) return Promise.reject(new Error('ReceiptOcr native module is not available'));
  return native.recognize(uri);
}

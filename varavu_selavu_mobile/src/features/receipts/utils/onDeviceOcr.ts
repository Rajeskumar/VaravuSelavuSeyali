import { Platform } from 'react-native';

// On-device receipt OCR (Apple Vision on iOS, Google ML Kit on Android — see
// modules/receipt-ocr): the phone reads the text, and only the text goes to the server's rule
// parser (/ingest/receipt/parse_ocr). No image upload, no LLM. Anything that goes wrong here
// returns null and the caller falls back to uploading the image.

export interface OcrLine {
  text: string;
  /** [x, y, width, height] in image pixels. */
  box: [number, number, number, number];
  /** Baseline tilt in radians; lets the server undo photo skew before grouping rows. */
  angle?: number;
  conf?: number;
}

export interface OcrResult {
  lines: OcrLine[];
  image_width: number;
  image_height: number;
}

interface NativeLine { text: string; x: number; y: number; width: number; height: number; angle?: number; confidence?: number }
interface NativeResult { lines: NativeLine[]; width?: number; height?: number }

// Fewer lines than this can't be a receipt worth parsing — let the server look at the image.
const MIN_LINES = 3;
// Matches the server's per-request cap; a longer read is better handled from the image.
const MAX_LINES = 400;

export function toOcrResult(result: NativeResult): OcrResult | null {
  const lines: OcrLine[] = [];
  let width = 0;
  let height = 0;
  for (const line of result.lines ?? []) {
    const text = (line.text ?? '').trim();
    if (!text || !(line.width > 0) || !(line.height > 0)) continue;
    lines.push({
      text: text.slice(0, 200),
      box: [line.x, line.y, line.width, line.height],
      angle: line.angle,
      conf: line.confidence,
    });
    width = Math.max(width, line.x + line.width);
    height = Math.max(height, line.y + line.height);
  }
  if (lines.length < MIN_LINES || lines.length > MAX_LINES) return null;
  return { lines, image_width: result.width || width, image_height: result.height || height };
}

export async function recognizeReceipt(uri: string): Promise<OcrResult | null> {
  if (Platform.OS === 'web') return null;
  try {
    const ReceiptOcr = require('../../../../modules/receipt-ocr');
    if (!ReceiptOcr.isAvailable) return null;
    return toOcrResult(await ReceiptOcr.recognize(uri));
  } catch {
    return null;
  }
}

// Server OCR reads at most ~900px across (see services/ocr/engine.py), so there's no point
// uploading a 12MP photo; re-encoding as JPEG also turns iPhone HEIC photos into a type the
// upload endpoint accepts, whatever the picker handed back.
const UPLOAD_MAX_WIDTH = 1600;

export interface UploadableImage {
  uri: string;
  /** Raw JPEG bytes for Expo SDK 57's winter/fetch FormData serializer (which rejects bare `{ uri }` parts). */
  bytes?: Uint8Array;
  name?: string;
  type?: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS base64 decoder that works identically in Hermes, JSC, V8, and Jest without Node's Buffer. */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length * 3) / 4 - pad);
  let j = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = clean[i + 2] === '=' ? 0 : B64.indexOf(clean[i + 2]);
    const d = clean[i + 3] === '=' ? 0 : B64.indexOf(clean[i + 3]);
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[j++] = (n >> 16) & 0xff;
    if (j < out.length) out[j++] = (n >> 8) & 0xff;
    if (j < out.length) out[j++] = n & 0xff;
  }
  return out;
}

export async function toUploadableJpeg(uri: string, width?: number): Promise<UploadableImage> {
  if (Platform.OS === 'web') return { uri };
  try {
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator');
    const ctx = ImageManipulator.manipulate(uri);
    if (!width || width > UPLOAD_MAX_WIDTH) ctx.resize({ width: UPLOAD_MAX_WIDTH });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    return {
      uri: saved.uri,
      bytes: saved.base64 ? base64ToBytes(saved.base64) : undefined,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    };
  } catch {
    return { uri };
  }
}

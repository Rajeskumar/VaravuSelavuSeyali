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
    const ReceiptOcr = require('../../modules/receipt-ocr');
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

export async function toUploadableJpeg(uri: string, width?: number): Promise<string> {
  if (Platform.OS === 'web') return uri;
  try {
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator');
    const ctx = ImageManipulator.manipulate(uri);
    if (!width || width > UPLOAD_MAX_WIDTH) ctx.resize({ width: UPLOAD_MAX_WIDTH });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return uri;
  }
}

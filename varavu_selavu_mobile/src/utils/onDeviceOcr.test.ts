import { toOcrResult } from './onDeviceOcr';

const line = (text: string, x: number, y: number, width: number, height: number, angle = 0) => ({
  text, x, y, width, height, angle, confidence: 0.9,
});

describe('toOcrResult', () => {
  it('maps native lines to [x, y, w, h] boxes for /parse_ocr', () => {
    const result = toOcrResult({
      lines: [
        line("Trader Joe's", 100, 10, 200, 30),
        line('HUMMUS', 20, 100, 100, 20, 0.03),
        line('  ', 0, 0, 10, 10),
        line('3.99', 360, 102, 60, 20),
        line('TOTAL 3.99', 20, 140, 400, 30),
      ],
      width: 480,
      height: 640,
    });
    expect(result).not.toBeNull();
    expect(result!.lines.map((l) => l.text)).toEqual(["Trader Joe's", 'HUMMUS', '3.99', 'TOTAL 3.99']);
    expect(result!.lines[1]).toEqual({ text: 'HUMMUS', box: [20, 100, 100, 20], angle: 0.03, conf: 0.9 });
    expect(result!.image_width).toBe(480);
    expect(result!.image_height).toBe(640);
  });

  it('derives the image size from the lines when the platform does not report it', () => {
    const result = toOcrResult({ lines: [line('A', 0, 0, 50, 10), line('B', 0, 20, 300, 10), line('C 1.00', 0, 40, 120, 10)] });
    expect(result!.image_width).toBe(300);
    expect(result!.image_height).toBe(50);
  });

  it('returns null when too little text was read to be a receipt', () => {
    expect(toOcrResult({ lines: [line('hi', 0, 0, 10, 10)] })).toBeNull();
  });

  it('truncates very long lines to the server limit', () => {
    const lines = ['X'.repeat(300), 'A 1.00', 'B 2.00'].map((t, i) => line(t, 0, i * 20, 100, 15));
    expect(toOcrResult({ lines })!.lines[0].text).toHaveLength(200);
  });
});

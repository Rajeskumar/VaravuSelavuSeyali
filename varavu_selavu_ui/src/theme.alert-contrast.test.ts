import { getTheme } from './theme';

// White text on a filled alert (the toasts) needs 4.5:1. MUI's defaults for info and warning don't.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe.each(['light', 'dark'] as const)('filled alert colours (%s)', (mode) => {
  const overrides: any = (getTheme(mode) as any).components?.MuiAlert?.styleOverrides;
  it('info and warning meet 4.5:1 with white text', () => {
    expect(contrastOnWhite(overrides.filledInfo.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastOnWhite(overrides.filledWarning.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
  it('the MUI defaults they replace would not', () => {
    expect(contrastOnWhite('#0288d1')).toBeLessThan(4.5);
    expect(contrastOnWhite('#ed6c02')).toBeLessThan(4.5);
  });
});

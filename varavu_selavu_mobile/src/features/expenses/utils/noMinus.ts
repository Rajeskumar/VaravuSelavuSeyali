/**
 * Minus values are not accepted in any money or split field (TS-FIX-101). An edit containing one is
 * ignored as a whole: stripping the sign would silently turn "-5" into 5. Mirrors web `utils/noMinus.ts`.
 */
export function noMinus(onChangeText: (text: string) => void): (text: string) => void {
  return (text) => {
    if (!/[-−]/.test(text)) onChangeText(text);
  };
}

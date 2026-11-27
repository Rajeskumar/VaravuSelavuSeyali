import fs from 'fs';
import path from 'path';
import { noMinus, noMinusProps } from './noMinus';

// TS-FIX-101 AC-004: minus values are not accepted in any form.
const change = (value: string) => ({ target: { value } }) as React.ChangeEvent<HTMLInputElement>;

test('an edit containing a minus sign is ignored, never stripped into a positive number', () => {
  const seen: string[] = [];
  const handler = noMinus((e) => seen.push(e.target.value));
  ['5', '-5', '−5', '5-', '-', '12.50'].forEach((v) => handler(change(v)));
  expect(seen).toEqual(['5', '12.50']);
});

test('the minus key is blocked, other keys are not', () => {
  const { onKeyDown } = noMinusProps(() => {});
  const press = (key: string) => { const preventDefault = jest.fn(); onKeyDown({ key, preventDefault } as never); return preventDefault.mock.calls.length; };
  expect([press('-'), press('Subtract'), press('5'), press('Backspace')]).toEqual([1, 1, 0, 0]);
});

/** Every numeric field in the app must go through a minus guard, so a new one can't skip it. */
test('every numeric input uses a minus guard', () => {
  const src = path.join(__dirname, '..');
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : /(?<!\.test)\.tsx$/.test(d.name) ? [path.join(dir, d.name)] : []);
  const unguarded: string[] = [];
  for (const file of files(src)) {
    // Exception: a scanned receipt line can be negative (a coupon). Pending an owner decision (ROADMAP).
    if (file.endsWith('ScannedItemsCard.tsx')) continue;
    const exempt = (element: string) => file.endsWith('AddExpenseForm.tsx') && element.includes('Line Total');
    const text = fs.readFileSync(file, 'utf8');
    for (const match of Array.from(text.matchAll(/type="number"|type: 'number'|inputMode(="|: ')(decimal|numeric)/g))) {
      const start = Math.max(0, ...['<TextField', '<InputBase', '<Input'].map((tag) => text.lastIndexOf(tag, match.index)));
      const element = text.slice(start, text.indexOf('/>', match.index!) + 2);
      // Guards: noMinus, the money sanitizer, the two-decimal pattern; a day of the month is clamped to 1-31.
      if (!/noMinus|sanitizeAmountInput|TWO_DECIMALS|Math\.max\(1, Math\.min\(31|\\d\*\\\.\?/.test(element) && !exempt(element)) {
        unguarded.push(`${path.relative(src, file)}:${text.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  expect(unguarded).toEqual([]);
});

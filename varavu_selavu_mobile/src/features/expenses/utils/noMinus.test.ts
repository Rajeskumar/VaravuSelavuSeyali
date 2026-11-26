import fs from 'fs';
import path from 'path';
import { noMinus } from './noMinus';

// TS-FIX-101 AC-004: minus values are not accepted in any form.
test('an edit containing a minus sign is ignored, never stripped into a positive number', () => {
  const seen: string[] = [];
  const handler = noMinus((text) => seen.push(text));
  ['5', '-5', '−5', '5-', '-', '12.50'].forEach(handler);
  expect(seen).toEqual(['5', '12.50']);
});

/** Every numeric field in the app must go through a minus guard, so a new one can't skip it. */
test('every numeric input uses a minus guard', () => {
  const src = path.join(__dirname, '..', '..', '..');
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : /(?<!\.test)\.tsx$/.test(d.name) ? [path.join(dir, d.name)] : []);
  const unguarded: string[] = [];
  for (const file of files(src)) {
    // Exception: a scanned receipt line can be negative (a coupon). Pending an owner decision (ROADMAP).
    if (file.endsWith('ScannedItemsCard.tsx')) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of Array.from(text.matchAll(/keyboardType="(numeric|decimal-pad|numbers-and-punctuation)"/g))) {
      const start = Math.max(0, ...['<TextInput', '<CustomInput'].map((tag) => text.lastIndexOf(tag, match.index)));
      const element = text.slice(start, text.indexOf('/>', match.index!) + 2);
      // Guards: noMinus, or an update function that only accepts the two-decimal (unsigned) pattern.
      if (!/noMinus|updateEntryValue|updateAmount\(/.test(element)) {
        unguarded.push(`${path.relative(src, file)}:${text.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  expect(unguarded).toEqual([]);
});

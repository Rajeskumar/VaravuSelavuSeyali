/**
 * Every bottom-sheet panel in the app is a Pressable that only exists to swallow backdrop taps
 * (`onPress={(e) => e.stopPropagation()}`). A Pressable is an accessibility element by default, and on iOS an
 * accessible container collapses its whole subtree into ONE element, so VoiceOver (and UI tests) could not reach
 * the rows, keys or buttons inside. This contract fails for any such wrapper that does not opt out, including
 * ones added later, and requires each sheet to be dismissible with the VoiceOver escape gesture (two-finger Z).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [full] : [];
  });
}

/** The opening tag (text between `<Pressable` and its closing `>`) that contains index `at`. */
function openingTag(text: string, at: number): string {
  const start = text.lastIndexOf('<Pressable', at);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && text[i - 1] !== '=') return text.slice(start, i + 1);
  }
  return text.slice(start);
}

const panels: { file: string; tag: string }[] = [];
const filesWithPanels = new Set<string>();
for (const file of sourceFiles(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/stopPropagation/g)) {
    panels.push({ file: path.relative(SRC, file), tag: openingTag(text, m.index as number) });
    filesWithPanels.add(file);
  }
}

/** Opening tag (from `<Tag` to its closing `>`) starting at index `start`. */
function tagFrom(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && text[i - 1] !== '=') return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** Every touchable that acts as a backdrop/scrim (its style names a backdrop or fills the screen). */
const backdrops: { file: string; tag: string }[] = [];
const filesWithBackdrops = new Set<string>();
for (const file of sourceFiles(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/<(Pressable|TouchableOpacity|TouchableWithoutFeedback)\b/g)) {
    const tag = tagFrom(text, m.index as number);
    if (/backdrop|absoluteFill/i.test(tag) && /onPress=/.test(tag)) {
      backdrops.push({ file: path.relative(SRC, file), tag });
      filesWithBackdrops.add(file);
    }
  }
}

describe('sheet backdrops (touchables styled as a backdrop or absoluteFill)', () => {
  test('the scan finds the app\'s backdrops', () => {
    expect(backdrops.length).toBeGreaterThanOrEqual(15);
  });

  // A backdrop is often the PARENT of the panel. If it is an accessibility element (a default Pressable is one, and a
  // label or role certainly makes it one), iOS exposes the whole sheet as that single element and the panel's rows
  // disappear from the tree: seen on the simulator. Childless sibling backdrops are only empty VoiceOver stops.
  test.each(backdrops.map((b, i) => [`${b.file} #${i}`, b.tag]))('%s is not an accessibility element', (_name, tag) => {
    expect(tag).toMatch(/accessible=\{false\}/);
    expect(tag).not.toMatch(/accessibilityLabel=|accessibilityRole=/);
  });

  test.each([...filesWithBackdrops].map((f) => [path.relative(SRC, f), f]))(
    '%s handles the VoiceOver escape gesture (two-finger Z)', (_name, file) => {
      expect(fs.readFileSync(file, 'utf8')).toMatch(/onAccessibilityEscape=/);
    });

  // iOS looks for the handler on the focused element and walks UP its superviews, so a handler on a sibling backdrop
  // never fires. The Add Expense sheet's backdrop is a sibling of the sheet: the handler must be on the modal root.
  test('the Add Expense sheet handles escape on an ancestor of its content (the modal root)', () => {
    const text = fs.readFileSync(path.join(SRC, 'features/expenses/screens/AddExpenseScreen.tsx'), 'utf8');
    const root = text.match(/<View style=\{styles\.modalRoot\}[^>]*>/)?.[0] ?? '';
    expect(root).toMatch(/onAccessibilityEscape=\{closeAddExpense\}/);
  });
});

describe('sheet panels (Pressable with stopPropagation)', () => {
  test('the scan finds the app\'s sheets', () => {
    expect(panels.length).toBeGreaterThanOrEqual(7);
  });

  test.each(panels.map((p, i) => [`${p.file} #${i}`, p.tag]))('%s opts out of accessibility focus', (_name, tag) => {
    expect(tag).toMatch(/accessible=\{false\}/);
    expect(tag).toMatch(/focusable=\{false\}/);
  });

  test.each([...filesWithPanels].map((f) => [path.relative(SRC, f), f]))('%s can be dismissed with the VoiceOver escape gesture', (_name, file) => {
    expect(fs.readFileSync(file, 'utf8')).toMatch(/onAccessibilityEscape=/);
  });
});

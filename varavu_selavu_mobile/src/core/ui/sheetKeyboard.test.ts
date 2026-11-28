/**
 * Android keyboard over modals (TS-FIX-103). A modal is its own window and, with edge-to-edge on, is not resized for the
 * keyboard (the activity's `softwareKeyboardLayoutMode: "pan"` does not reach it), so Save, amount and split fields ended
 * up behind it. Layout cannot be measured in Jest; this scans for the two ways a sheet loses the avoidance, and the
 * Android native flows prove the layout.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return full.endsWith('.tsx') && !full.endsWith('.test.tsx') ? [full] : [];
  });
}

const files = sources(SRC).map((file) => ({ name: path.relative(SRC, file), text: fs.readFileSync(file, 'utf8') }));

/** The source of each outermost `<Modal …>…</Modal>`. */
function modalBlocks(text: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (const m of text.matchAll(/<Modal\b|<\/Modal>/g)) {
    if (m[0] === '</Modal>') {
      depth -= 1;
      if (depth === 0) blocks.push(text.slice(start, m.index));
    } else {
      if (depth === 0) start = m.index as number;
      depth += 1;
    }
  }
  return blocks;
}

describe('modals stay above the keyboard', () => {
  it('never switches keyboard avoidance off for Android', () => {
    const off = files
      .filter((f) => /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(f.text))
      .map((f) => f.name);
    expect(off).toEqual([]);
  });

  it('gives every modal with a text field some keyboard avoidance', () => {
    // TypeaheadInput's own Modal is the suggestion dropdown anchored to its field, not a sheet.
    const dropdownOnly = ['core/ui/TypeaheadInput.tsx'];
    // Per modal, not per file: one covered sheet must not hide another in the same screen.
    const bare = files
      .filter((f) => !dropdownOnly.includes(f.name))
      .flatMap((f) => modalBlocks(f.text).map((block, i) => ({ name: `${f.name} #${i + 1}`, block })))
      .filter(({ block }) => /<(TextInput|CustomInput|TypeaheadInput|SplitEditor)\b/.test(block))
      .filter(({ block }) => !/<(KeyboardAvoidingView|KeyboardLift)\b/.test(block))
      .map(({ name }) => name);
    expect(bare).toEqual([]);
  });
});

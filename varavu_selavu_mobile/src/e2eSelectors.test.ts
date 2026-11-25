/**
 * Native E2E selector contract (qa/mobile). Every `id:` a Maestro flow taps or asserts must still exist in the
 * app source, so renaming or removing a testID fails here (fast, in the normal Jest run) instead of in a
 * 20-minute simulator job. testIDs are a test contract: see AGENTS.md.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = __dirname;
const FLOWS = path.resolve(SRC, '../../qa/mobile');

function walk(dir: string, accept: (f: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full, accept);
    return accept(full) ? [full] : [];
  });
}

const flowIds = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const file of walk(path.join(FLOWS, 'flows'), (f) => f.endsWith('.yaml')).concat(walk(path.join(FLOWS, 'subflows'), (f) => f.endsWith('.yaml')))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^\s*id:\s*["']?([A-Za-z0-9_.\-]+)["']?\s*$/gm)) {
      found.set(m[1], [...(found.get(m[1]) ?? []), path.relative(FLOWS, file)]);
    }
  }
  return found;
};

const sourceText = walk(SRC, (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const tabRouteIds = [...fs.readFileSync(path.join(SRC, 'app/tabs.tsx'), 'utf8').matchAll(/name:\s*'([^']+)'/g)].map((m) => `tabs.${m[1].replace(/\s+/g, '-')}`);
const headerSlugs = new Set([...sourceText.matchAll(/<ScreenHeader[^>]*?\btitle="([^"]+)"/gs)].map((m) => `header.${slug(m[1])}`));
// Derived from the app (KEYS + KEY_TEST_ID in AddExpenseScreen), so renaming a key id there fails here too.
const addExpenseSource = fs.readFileSync(path.join(SRC, 'features/expenses/screens/AddExpenseScreen.tsx'), 'utf8');
const keyGlyphs = [...(addExpenseSource.match(/const KEYS = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const keyAliases = Object.fromEntries([...(addExpenseSource.match(/const KEY_TEST_ID[^=]*= \{([^}]+)\}/)?.[1] ?? '').matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
const keypad = new Set(keyGlyphs.map((k) => `addExpense.key.${keyAliases[k] ?? k}`));

function exists(id: string): boolean {
  if (id.startsWith('tabs.')) return tabRouteIds.includes(id);
  if (id.startsWith('header.')) return headerSlugs.has(id);
  if (id.startsWith('addExpense.key.')) return keypad.has(id);
  // A real testID attribute, not just the string somewhere (a comment would not make the element selectable).
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`testID=\\{?["'\`]${escaped}["'\`]`).test(sourceText);
}

describe('qa/mobile flow selectors', () => {
  const ids = flowIds();

  test('flows exist and reference ids', () => {
    expect(ids.size).toBeGreaterThan(5);
  });

  test('the keypad ids were derived from the app (12 keys)', () => {
    expect(keypad.size).toBe(12);
    expect(keypad.has('addExpense.key.dot')).toBe(true);
    expect(keypad.has('addExpense.key.backspace')).toBe(true);
  });

  test.each([...ids.keys()].sort())('testID %s exists in the app source', (id) => {
    expect({ id, usedBy: ids.get(id), exists: exists(id) }).toMatchObject({ exists: true });
  });
});

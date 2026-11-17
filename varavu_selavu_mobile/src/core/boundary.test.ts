/**
 * Dependency direction: app → features → core.
 *  - nothing under src/core may import from src/features or src/app
 *  - nothing under src/features may import from src/app
 * Covers import/export-from, require(), dynamic import() and jest.mock()/requireActual() specifiers
 * (test files included, so a test can't smuggle in a reverse dependency either).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*|\bjest\.\w+\(\s*)(['"])(\.{1,2}\/[^'"]*)\1/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

function violations(fromDir: string, forbidden: string[]): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(path.join(SRC, fromDir))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      const target = path.resolve(path.dirname(file), match[2]);
      const area = path.relative(SRC, target).split(path.sep)[0];
      if (forbidden.includes(area)) {
        found.push(`${path.relative(SRC, file)} imports ${match[2]}`);
      }
    }
  }
  return found;
}

test('src/core does not import from src/features or src/app', () => {
  expect(violations('core', ['features', 'app'])).toEqual([]);
});

test('src/features does not import from src/app', () => {
  expect(violations('features', ['app'])).toEqual([]);
});

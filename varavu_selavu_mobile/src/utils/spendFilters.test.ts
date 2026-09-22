import { matchesSpendFilters, monthKeyOf, inMainCategory, SpendFilters } from './spendFilters';
import { MAIN_CATEGORIES, CATEGORY_GROUPS } from '../constants/categories';

const base: SpendFilters = { month: '', category: '', scope: 'all', query: '' };
const row = { key: 'p-1', date: '09/19/2026', category: CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0], desc: 'India bazaar dinner', meta: 'Sep 19' };

describe('spendFilters', () => {
  it('parses month keys from MM/DD/YYYY and ISO dates', () => {
    expect(monthKeyOf('09/19/2026')).toBe('2026-09');
    expect(monthKeyOf('2026-03-05T10:00:00')).toBe('2026-03');
    expect(monthKeyOf('nope')).toBe('');
  });
  it('matches everything with empty filters', () => {
    expect(matchesSpendFilters(row, base)).toBe(true);
  });
  it('filters by month', () => {
    expect(matchesSpendFilters(row, { ...base, month: '2026-09' })).toBe(true);
    expect(matchesSpendFilters(row, { ...base, month: '2026-08' })).toBe(false);
  });
  it('filters by main category via its subcategories', () => {
    const main = MAIN_CATEGORIES[0];
    expect(inMainCategory(row.category, main)).toBe(true);
    expect(matchesSpendFilters(row, { ...base, category: main })).toBe(true);
    expect(matchesSpendFilters(row, { ...base, category: MAIN_CATEGORIES[1] })).toBe(false);
  });
  it('filters by scope using the row key prefix', () => {
    expect(matchesSpendFilters(row, { ...base, scope: 'personal' })).toBe(true);
    expect(matchesSpendFilters(row, { ...base, scope: 'groups' })).toBe(false);
    expect(matchesSpendFilters({ ...row, key: 'g-9' }, { ...base, scope: 'groups' })).toBe(true);
  });
  it('searches description and meta, case-insensitively', () => {
    expect(matchesSpendFilters(row, { ...base, query: ' BAZAAR ' })).toBe(true);
    expect(matchesSpendFilters(row, { ...base, query: 'sushi' })).toBe(false);
  });
});

import { CATEGORY_GROUPS } from '../constants/categories';

export type SpendScope = 'all' | 'personal' | 'groups';

export interface SpendFilterRow {
  key: string;
  date: string;
  category: string;
  desc: string;
  meta: string;
}

export interface SpendFilters {
  /** 'YYYY-MM', '' = all time. */
  month: string;
  /** A main category ('Food & Dining'…), '' = any. Rows carry subcategories, so it matches those too. */
  category: string;
  scope: SpendScope;
  query: string;
}

/** 'YYYY-MM' of an 'MM/DD/YYYY' or ISO date string, '' when unparseable. */
export function monthKeyOf(dateStr: string): string {
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return '';
}

export function inMainCategory(rowCategory: string, main: string): boolean {
  return rowCategory === main || (CATEGORY_GROUPS[main] ?? []).includes(rowCategory);
}

/** Personal rows are keyed `p-…`, group-share rows `g-…`. */
export function matchesSpendFilters(row: SpendFilterRow, f: SpendFilters): boolean {
  if (f.month && monthKeyOf(row.date) !== f.month) return false;
  if (f.category && !inMainCategory(row.category, f.category)) return false;
  if (f.scope === 'personal' && !row.key.startsWith('p-')) return false;
  if (f.scope === 'groups' && !row.key.startsWith('g-')) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${row.desc} ${row.meta}`.toLowerCase().includes(q)) return false;
  return true;
}

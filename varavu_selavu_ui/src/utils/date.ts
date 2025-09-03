export function isoToMMDDYYYY(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month?.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
}

export function mmddyyyyToISO(md: string): string {
  const [month, day, year] = md?.split('/');
  return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
}

export function parseMMDDYYYY(md: string): Date {
  return new Date(mmddyyyyToISO(md));
}

// Parses either 'YYYY-MM-DD' or 'MM/DD/YYYY' as a local Date (no timezone shift)
export function parseAppDate(input: string): Date {
  if (!input) return new Date(NaN);
  // If it contains a time component, delegate to native Date (likely ISO with TZ)
  if (input.includes('T')) return new Date(input);
  if (input.includes('-')) {
    const [y, m, d] = input.split('-').map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }
  if (input.includes('/')) {
    const [m, d, y] = input.split('/').map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }
  // Fallback
  return new Date(input);
}

export function formatAppDate(input: string): string {
  const d = parseAppDate(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString();
}

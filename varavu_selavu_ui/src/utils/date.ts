export function isoToMMDDYYYY(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
}

export function mmddyyyyToISO(md: string): string {
  const [month, day, year] = md.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseMMDDYYYY(md: string): Date {
  return new Date(mmddyyyyToISO(md));
}

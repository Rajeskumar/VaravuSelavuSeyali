/** First word of the profile name, else the email's local part, else `fallback`. */
export function firstNameOf(name: string | null | undefined, email: string | null | undefined, fallback = 'there'): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  if (first) return first;
  const local = (email ?? '').split('@')[0];
  return local || fallback;
}

/** Single-letter avatar initial from the same sources. */
export function initialOf(name: string | null | undefined, email: string | null | undefined): string {
  return (firstNameOf(name, email, '?').charAt(0) || '?').toUpperCase();
}

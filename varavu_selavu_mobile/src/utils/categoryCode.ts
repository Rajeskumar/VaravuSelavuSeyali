/**
 * V2 list rows show a mono three-letter category code on a tinted tile instead of an emoji.
 * Both the code and the tint are pure functions of the category name, so the same category
 * always renders the same tile everywhere (color follows the entity, not its position).
 */

// Codes the V2 mocks spell out explicitly; anything else falls back to its first three letters.
const KNOWN_CODES: Record<string, string> = {
  'dining out': 'DIN',
  groceries: 'GRO',
  maintenance: 'UTL',
  utilities: 'UTL',
  electricity: 'UTL',
  water: 'UTL',
  'heat/gas': 'UTL',
  gifts: 'GFT',
  personal: 'PER',
  subscriptions: 'SUB',
  subscription: 'SUB',
  shopping: 'SHP',
  cleaning: 'CLN',
  'gas/fuel': 'GAS',
  transportation: 'TRN',
  rent: 'RNT',
  hotel: 'HTL',
  clothing: 'CLO',
  electronics: 'ELC',
  'medical expenses': 'MED',
  entertainment: 'ENT',
  travel: 'TRV',
  coffee: 'COF',
};

// Fixed ink-independent pastel ramp shared by tile tint + code color. Deliberately excludes the
// theme's error red — red is reserved for money direction, never for identity.
export const CATEGORY_TONES = ['#AEA5FF', '#00E0E0', '#FBBF24', '#4ADE80', '#EF8BC5'] as const;

export function categoryCode(category?: string | null): string {
  const key = (category || '').toLowerCase().trim();
  if (!key) return 'OTH';
  if (KNOWN_CODES[key]) return KNOWN_CODES[key];
  const letters = key.replace(/[^a-z0-9]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'OTH').padEnd(3, 'X');
}

export function categoryTone(category?: string | null): string {
  const key = (category || '').toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

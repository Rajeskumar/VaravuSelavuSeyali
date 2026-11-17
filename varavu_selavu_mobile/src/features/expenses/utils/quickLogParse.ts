export interface QuickLogGroupLike {
  group_id: string;
  name: string;
}

export interface QuickLogParsed {
  amount: number;
  merchant: string | null;
  groupId: string | null;
  groupName: string | null;
  personName: string | null;
  /** The text explicitly asks to split ("split with …") — when no group matched, callers must
   * not silently log it as a personal expense. */
  splitRequested: boolean;
  category: string;
  description: string;
}

const AMOUNT_RE = /(?:(\$|£|€|₹)\s?)?(\d+(?:[.,]\d{1,2})?)(\s?(?:dollars?|bucks|usd|eur|gbp|inr|rs)\b)?(?![\d%])/gi;

/** Every number in the text, so the amount isn't just "the first digits" — in "2 coffees 9.50"
 * that was the quantity. A currency-marked number wins, then one with cents, then the last one. */
function pickAmount(text: string): { value: number; index: number; length: number } | null {
  const found: { value: number; index: number; length: number; marked: boolean; decimal: boolean }[] = [];
  for (const m of Array.from(text.matchAll(AMOUNT_RE))) {
    const start = m.index ?? 0;
    // Skip digits glued to letters ("7-Eleven" is fine, "B2B" / "3rd" are not amounts).
    if (start > 0 && /[A-Za-z]/.test(text[start - 1])) continue;
    if (/^[A-Za-z]/.test(text.slice(start + m[0].length)) && !m[3]) continue;
    found.push({
      value: parseFloat(m[2].replace(',', '.')),
      index: start,
      length: m[0].length,
      marked: !!(m[1] || m[3]),
      decimal: /[.,]/.test(m[2]),
    });
  }
  if (!found.length) return null;
  return found.find((f) => f.marked) || found.find((f) => f.decimal) || found[found.length - 1];
}

/**
 * Home's "type to log" bar (TrackSpense v3 design, ported from the web app's
 * `varavu_selavu_ui/src/utils/quickLogParse.ts`) — a lightweight, purely client-side regex
 * parser, not real NLP. Good enough for phrasing like "coffee 6.75 at Blue Bottle" or
 * "groceries 42 for Roommates"; anything it can't extract an amount from returns null and the
 * caller falls back to the full Add Expense sheet (or routes to the AI chat if it looks like a
 * question — see useQuickLogBar.ts).
 */
export function parseQuickLog(text: string, groups: QuickLogGroupLike[]): QuickLogParsed | null {
  if (!text || !text.trim()) return null;

  const picked = pickAmount(text);
  if (!picked || !(picked.value > 0)) return null;
  const amount = picked.value;
  // Everything else is worked out on the text with the amount taken out, so a merchant or the
  // description never swallows it ("lunch at Chipotle 18.40").
  const rest = (text.slice(0, picked.index) + ' ' + text.slice(picked.index + picked.length)).replace(/\s+/g, ' ').trim();

  const merchantMatch = rest.match(/\bat ([A-Za-z0-9][A-Za-z0-9'&.\- ]*?)(?= (?:with|for|split|in)\b|$)/i);
  const merchant = merchantMatch ? merchantMatch[1].trim() : null;

  const lower = text.toLowerCase();
  // Longest name first, so "Weekend Trip" wins over a separate "Trip" group when both appear.
  const matchedGroup =
    [...groups]
      .sort((a, b) => b.name.trim().length - a.name.trim().length)
      .find((g) => g.name.trim() && lower.includes(g.name.trim().toLowerCase())) || null;
  const splitRequested = /\bsplit\b/i.test(text);

  let personName: string | null = null;
  if (!matchedGroup) {
    const personMatch = text.match(/with ([A-Z][a-z]+)/);
    if (personMatch) personName = personMatch[1];
  }

  let category = 'General';
  if (/uber ?eats|doordash|grubhub|coffee|lunch|dinner|breakfast|brunch|pizza|taco|burger|sushi/i.test(text)) category = 'Dining out';
  else if (/grocer|costco|market|trader joe|whole foods/i.test(text)) category = 'Groceries';
  else if (/\b(uber|lyft|taxi|cab|rides?)\b/i.test(text)) category = 'Taxi';
  else if (/\b(gas|fuel|petrol)\b/i.test(text)) category = 'Gas/fuel';

  // Description = the words the user typed, minus the amount, the "at <merchant>" clause and the
  // group/split clause (those show as their own fields). It used to keep only the first word, so
  // "lunch with team" became "Lunch".
  let desc = rest;
  if (merchantMatch) desc = desc.replace(merchantMatch[0], ' ');
  if (matchedGroup) {
    const name = matchedGroup.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    desc = desc.replace(new RegExp(`\\b(?:split\\s+)?(?:with|for|in)?\\s*(?:the\\s+)?${name}(?:\\s+group)?\\b`, 'i'), ' ');
  }
  desc = desc.replace(/\bsplit\b(?:\s+(?:it|equally|evenly))?/gi, ' ').replace(/\s+/g, ' ').trim();
  desc = desc.replace(/\s+(?:with|for|in|at|and)$/i, '').trim();
  if (!desc) desc = merchant || category;
  const description = desc.charAt(0).toUpperCase() + desc.slice(1) + (merchant && desc !== merchant ? ` at ${merchant}` : '');

  return {
    amount,
    merchant,
    groupId: matchedGroup?.group_id ?? null,
    groupName: matchedGroup?.name ?? null,
    personName,
    splitRequested,
    category,
    description,
  };
}

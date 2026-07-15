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
  category: string;
  description: string;
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

  const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1]);

  const merchantMatch = text.match(/at ([A-Za-z][A-Za-z' ]*?)(?: with| for| split|$)/i);
  const merchant = merchantMatch ? merchantMatch[1].trim() : null;

  const lower = text.toLowerCase();
  const matchedGroup = groups.find((g) => g.name.trim() && lower.includes(g.name.toLowerCase())) || null;

  let personName: string | null = null;
  if (!matchedGroup) {
    const personMatch = text.match(/with ([A-Z][a-z]+)/);
    if (personMatch) personName = personMatch[1];
  }

  let category = 'General';
  if (/coffee|lunch|dinner|breakfast|pizza|taco/i.test(text)) category = 'Dining out';
  else if (/grocer|costco|market/i.test(text)) category = 'Groceries';
  else if (/uber|lyft|taxi|\bgas\b/i.test(text)) category = 'Gas/fuel';

  const firstWord = text.trim().split(/\s+/)[0];
  const description = firstWord.charAt(0).toUpperCase() + firstWord.slice(1) + (merchant ? ` at ${merchant}` : '');

  return {
    amount,
    merchant,
    groupId: matchedGroup?.group_id ?? null,
    groupName: matchedGroup?.name ?? null,
    personName,
    category,
    description,
  };
}

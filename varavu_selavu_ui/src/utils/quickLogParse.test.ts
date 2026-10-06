import { parseQuickLog } from './quickLogParse';

const GROUPS = [
  { group_id: 'g-roommates', name: 'Roommates' },
  { group_id: 'g-trip', name: 'Weekend Trip' },
];

describe('parseQuickLog', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(parseQuickLog('', GROUPS)).toBeNull();
    expect(parseQuickLog('   ', GROUPS)).toBeNull();
  });

  it('returns null when no amount can be found', () => {
    expect(parseQuickLog('just chatting about nothing', GROUPS)).toBeNull();
  });

  it('extracts amount, merchant, and a dining category', () => {
    const parsed = parseQuickLog('coffee 6.75 at Blue Bottle', GROUPS);
    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(6.75);
    expect(parsed!.merchant).toBe('Blue Bottle');
    expect(parsed!.category).toBe('Dining out');
    expect(parsed!.description).toBe('Coffee at Blue Bottle');
    expect(parsed!.groupId).toBeNull();
    expect(parsed!.personName).toBeNull();
  });

  it('matches a real group by name, case-insensitively', () => {
    const parsed = parseQuickLog('groceries 42.10 at Costco for roommates', GROUPS);
    expect(parsed).not.toBeNull();
    expect(parsed!.groupId).toBe('g-roommates');
    expect(parsed!.groupName).toBe('Roommates');
    expect(parsed!.merchant).toBe('Costco');
    expect(parsed!.category).toBe('Groceries');
  });

  it('falls back to a person match when no group name is present', () => {
    const parsed = parseQuickLog('lunch 12 with Sam', GROUPS);
    expect(parsed).not.toBeNull();
    expect(parsed!.groupId).toBeNull();
    expect(parsed!.personName).toBe('Sam');
  });

  it('defaults to the General category when nothing matches', () => {
    const parsed = parseQuickLog('parking 5', GROUPS);
    expect(parsed).not.toBeNull();
    expect(parsed!.category).toBe('General');
  });
});


describe('parseQuickLog split intent', () => {
  it('matches a multi-word group name and flags the split request', () => {
    const groups = [{ group_id: 'g-ux', name: 'UX Audit Test' }];
    const parsed = parseQuickLog('UX audit group test 20 at UX Test Store split with UX Audit Test', groups);
    expect(parsed!.groupId).toBe('g-ux');
    expect(parsed!.merchant).toBe('UX Test Store');
    expect(parsed!.splitRequested).toBe(true);
  });

  it('flags an unmatched split so callers do not log it as personal', () => {
    const parsed = parseQuickLog('pizza 30 split with Nonexistent Group', GROUPS);
    expect(parsed!.groupId).toBeNull();
    expect(parsed!.splitRequested).toBe(true);
  });

  it('does not flag a plain personal entry', () => {
    expect(parseQuickLog('coffee 6.75 at Blue Bottle', GROUPS)!.splitRequested).toBe(false);
  });

  it('prefers the longest matching group name', () => {
    const groups = [
      { group_id: 'g-trip', name: 'Trip' },
      { group_id: 'g-weekend', name: 'Weekend Trip' },
    ];
    expect(parseQuickLog('gas 40 split with weekend trip', groups)!.groupId).toBe('g-weekend');
  });
});

describe('parseQuickLog phrasing from the readiness review', () => {
  it('keeps every word of the description, not just the first', () => {
    const parsed = parseQuickLog('lunch with team 18.40 at Chipotle', GROUPS);
    expect(parsed!.amount).toBe(18.4);
    expect(parsed!.merchant).toBe('Chipotle');
    expect(parsed!.description).toBe('Lunch with team at Chipotle');
    expect(parsed!.category).toBe('Dining out');
  });

  it('maps rides to Taxi rather than Gas/fuel', () => {
    expect(parseQuickLog('uber 22', GROUPS)!.category).toBe('Taxi');
    expect(parseQuickLog('lyft home 14.20', GROUPS)!.category).toBe('Taxi');
    expect(parseQuickLog('gas 40 at Shell', GROUPS)!.category).toBe('Gas/fuel');
  });

  it('prefers the decimal number over a leading quantity', () => {
    const parsed = parseQuickLog('2 coffees 9.50', GROUPS);
    expect(parsed!.amount).toBe(9.5);
    expect(parsed!.description).toBe('2 coffees');
  });

  it('prefers a currency-marked number', () => {
    expect(parseQuickLog('3 tacos $12', GROUPS)!.amount).toBe(12);
    expect(parseQuickLog('movie tickets 2 for 30 dollars', GROUPS)!.amount).toBe(30);
  });

  it('finds the merchant when the amount comes after it', () => {
    const parsed = parseQuickLog('lunch at Chipotle 18.40', GROUPS);
    expect(parsed!.merchant).toBe('Chipotle');
    expect(parsed!.amount).toBe(18.4);
    expect(parsed!.description).toBe('Lunch at Chipotle');
  });

  it('leaves the group clause out of the description', () => {
    const parsed = parseQuickLog('groceries 42 for Roommates', GROUPS);
    expect(parsed!.groupId).toBe('g-roommates');
    expect(parsed!.description).toBe('Groceries');
  });
});

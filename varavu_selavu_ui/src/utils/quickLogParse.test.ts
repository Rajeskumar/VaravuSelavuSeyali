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

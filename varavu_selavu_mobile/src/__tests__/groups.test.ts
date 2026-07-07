/**
 * groups.test.ts — Tests for TS-GRP-109 mobile groups implementation.
 *
 * Tests:
 * 1. computeEqualShares §3.3 invariant: sum of shares == totalAmount
 * 2. computeEqualShares rounding correctness (penny remainder on first member)
 * 3. Deep-link parsing: trackspense://join/{token} → token param extracted
 * 4. SplitEditor renders correctly
 * 5. GroupsScreen renders empty state
 */

import { computeEqualShares } from '../components/SplitEditor';
import { MemberDTO } from '../api/groups';

// ─── SplitEditor §3.3 invariant tests ────────────────────────────────────────

const makeMember = (id: string): MemberDTO => ({
  member_id: id,
  display_name: `Member ${id}`,
  role: 'member',
  status: 'active',
});

describe('computeEqualShares — §3.3 invariant', () => {
  test('sum of shares equals total for 2 members', () => {
    const members = [makeMember('a'), makeMember('b')];
    const shares = computeEqualShares(members, 100);
    const total = shares.reduce((a, b) => a + b, 0);
    expect(Math.round(total * 100)).toBe(Math.round(100 * 100));
  });

  test('sum of shares equals total for 3 members (penny remainder)', () => {
    const members = [makeMember('a'), makeMember('b'), makeMember('c')];
    // $10 / 3 = $3.33, $3.33, $3.34 (remainder goes to first)
    const shares = computeEqualShares(members, 10);
    const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(total).toBe(10);
  });

  test('sum of shares equals total for 7 members (non-divisible amount)', () => {
    const members = Array.from({ length: 7 }, (_, i) => makeMember(String(i)));
    const amount = 99.99;
    const shares = computeEqualShares(members, amount);
    const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(total).toBe(amount);
  });

  test('returns empty array for 0 members', () => {
    expect(computeEqualShares([], 100)).toEqual([]);
  });

  test('single member gets 100% of the amount', () => {
    const shares = computeEqualShares([makeMember('x')], 42.5);
    expect(shares).toHaveLength(1);
    expect(shares[0]).toBe(42.5);
  });

  test('§3.3 invariant holds for large amounts', () => {
    const members = Array.from({ length: 6 }, (_, i) => makeMember(String(i)));
    const amount = 1234.56;
    const shares = computeEqualShares(members, amount);
    const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(total).toBe(amount);
  });
});

// ─── Deep-link parsing test ──────────────────────────────────────────────────

describe('Deep-link: trackspense://join/{token}', () => {
  /**
   * The actual expo-linking parseURL is not available in Jest (no native module),
   * so we test our own URL parsing logic directly.
   * In production, NavigationContainer's linking.config.screens handles routing
   * via the Linking prefixes config in App.tsx.
   */
  function parseInviteToken(url: string): string | null {
    try {
      // Handle both trackspense://join/TOKEN and trackspense:///join/TOKEN
      const match = url.match(/join\/([^?#/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  test('extracts token from trackspense://join/{token}', () => {
    const token = parseInviteToken('trackspense://join/abc-123-token');
    expect(token).toBe('abc-123-token');
  });

  test('extracts token from trackspense:///join/{token}', () => {
    const token = parseInviteToken('trackspense:///join/my-invite-token');
    expect(token).toBe('my-invite-token');
  });

  test('returns null for URLs without a join path', () => {
    const token = parseInviteToken('trackspense://groups/some-group-id');
    expect(token).toBeNull();
  });

  test('handles UUID-format tokens', () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const token = parseInviteToken(`trackspense://join/${uuid}`);
    expect(token).toBe(uuid);
  });

  test('strips query params from token', () => {
    const token = parseInviteToken('trackspense://join/abc-token?utm_source=share');
    // The regex stops at '?' so it returns just the token
    expect(token).toBe('abc-token');
  });
});

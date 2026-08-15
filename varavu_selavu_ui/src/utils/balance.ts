/** Shared derivation of a member's net-balance presentation.
 *
 * Nets arrive as floats from the API, so an exact `=== 0` test can render a
 * rounding artifact as "you owe $0.00". Anything under half a cent is settled.
 */
import { formatMoney } from './money';

export const SETTLED_EPSILON = 0.005;

export type BalanceDirection = 'owed' | 'owes' | 'settled';

export function balanceDirection(net: number): BalanceDirection {
  if (!Number.isFinite(net) || Math.abs(net) < SETTLED_EPSILON) return 'settled';
  return net > 0 ? 'owed' : 'owes';
}

export function isSettled(net: number): boolean {
  return balanceDirection(net) === 'settled';
}

export function formatBalanceAmount(net: number, currency: string = 'USD'): string {
  return formatMoney(net, currency);
}

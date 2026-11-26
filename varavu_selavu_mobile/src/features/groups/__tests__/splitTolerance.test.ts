/** TS-FIX-101: the server needs exact totals, so a total that is a cent out must not be accepted. */
import { computeSplitValid } from '../components/SplitEditor';
import { computePayersValid } from '../components/PayerPicker';

const entries = (values: number[]) => values.map((value, i) => ({ member_id: `m${i}`, value }));
const paid = (values: number[]) => values.map((amount_paid, i) => ({ member_id: `m${i}`, amount_paid }));

it('refuses exact and percentage splits that are a cent out', () => {
  expect(computeSplitValid({ type: 'exact', entries: entries([33.33, 33.33, 33.33]) }, 100)).toBe(false);
  expect(computeSplitValid({ type: 'percentage', entries: entries([33.33, 33.33, 33.33]) }, 100)).toBe(false);
});

it('refuses 3.33 x 3 on 10.00', () => {
  expect(computeSplitValid({ type: 'exact', entries: entries([3.33, 3.33, 3.33]) }, 10)).toBe(false);
});

it('accepts splits that add up, despite floating-point noise', () => {
  expect(computeSplitValid({ type: 'exact', entries: entries([33.33, 33.33, 33.34]) }, 100)).toBe(true);
  expect(computeSplitValid({ type: 'percentage', entries: entries([33.33, 33.33, 33.34]) }, 100)).toBe(true);
  expect(computeSplitValid({ type: 'exact', entries: entries([0.1, 0.2]) }, 0.3)).toBe(true);
});

it('refuses payer totals that are a cent out', () => {
  expect(computePayersValid(paid([5, 4.99]), 10)).toBe(false);
  expect(computePayersValid(paid([0.1, 0.2]), 0.3)).toBe(true);
});

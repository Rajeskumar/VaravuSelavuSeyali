import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrueTotalHero, { computeIPaidTotal, computeMyExpensesTotal, SpendLens } from './TrueTotalHero';
import { AnalysisGroupSummary } from '../../api/analysis';

// TS-QA-101: a deleted/archived/left group drops out of group_summaries (the "your groups" list)
// but its shares are still spending — Analysis counts them, so the Dashboard hero must too.
const activeOnly: AnalysisGroupSummary[] = [
  { group_id: 'g1', name: 'Trip', my_share: 45, i_paid: 90, group_total: 90, my_balance: 45 },
];

describe('Dashboard hero totals', () => {
  it('My expenses uses the server group share, which includes groups missing from the summaries', () => {
    // A deleted group adds another 65 of share; the summaries only know the active 45.
    expect(computeMyExpensesTotal(50, activeOnly, { personal: 50, group_share: 110, i_paid_share: 190 })).toBe(160);
  });

  it('I paid uses the server i_paid_share the same way', () => {
    expect(computeIPaidTotal(50, activeOnly, { personal: 50, group_share: 110, i_paid_share: 190 })).toBe(240);
  });

  it('rounds to cents instead of leaking float noise', () => {
    expect(computeMyExpensesTotal(0.1, [], { personal: 0.1, group_share: 0.2, i_paid_share: 0 })).toBe(0.3);
  });

  it('falls back to summing the summaries when the response has no breakdown', () => {
    expect(computeMyExpensesTotal(50, activeOnly, null)).toBe(95);
    expect(computeIPaidTotal(50, activeOnly)).toBe(140);
  });

  it('I paid falls back to the summaries when an older server omits i_paid_share', () => {
    expect(computeIPaidTotal(50, activeOnly, { personal: 50, group_share: 45 })).toBe(140);
  });
});


// The wiring, not just the maths: the rendered hero must show the breakdown-based total in both
// lenses even when group_summaries is missing a (deleted) group.
function Harness() {
  const [lens, setLens] = React.useState<SpendLens>('share');
  return (
    <MemoryRouter>
      <TrueTotalHero
        personalTotal={50}
        spendBreakdown={{ personal: 50, group_share: 110, i_paid_share: 190 }}
        groupSummaries={activeOnly}
        groupsEnabled
        periodLabel="November"
        lens={lens}
        onLensChange={setLens}
      />
    </MemoryRouter>
  );
}

it('renders the server breakdown total for My expenses and for I paid', () => {
  render(<Harness />);
  expect(screen.getByTestId('true-total-hero-amount')).toHaveTextContent('160.00');
  fireEvent.click(screen.getByRole('button', { name: 'I paid' }));
  expect(screen.getByTestId('true-total-hero-amount')).toHaveTextContent('240.00');
});

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import CardsTab from './CardsTab';
import * as cardsApi from '../../api/cards';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

const myCard = { id: 'u1', card_id: 'c1', issuer: 'Chase', card_name: 'Freedom', reward_type: 'cashback', is_default: true, is_custom: false, added_at: '2026-10-01' };
const byCard = (spend: number) => [{ card_id: 'c1', card_name: 'Freedom', reward_type: 'cashback', spend, earned_raw: 1.41, earned_usd: 1.41, effective_rate: 1.5, top_category: 'Groceries', is_default: true, still_held: true, cap_hit: false }];
const category = { category: 'Groceries', actual_spend: 90, spend_source: 'personal_plus_group_paid', actual_earned_estimate: 0.9, held_card_used: 'Freedom', optimal_in_wallet_card: 'Freedom', optimal_in_wallet_earned_estimate: 0.9, optimal_catalog_card: 'Gold', optimal_catalog_earned_estimate: 3.6, cap_note: null, is_using_best_held_card: true };

function renderWith(coach: any) {
  jest.spyOn(cardsApi, 'listMyCards').mockResolvedValue([myCard] as any);
  jest.spyOn(cardsApi, 'getCardCoach').mockResolvedValue({
    period: { year: null, month: null }, total_estimated_gap: 2.7, by_category: [category], by_merchant: [], filter_info: { year: null, month: null, group_share_included: true },
    best_card_id: 'c1', unassigned_spend: 0, ...coach,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><CardsTab /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => jest.restoreAllMocks());

test('mostly unattributed spend: the headline is an estimate, rows say "Estimated"', async () => {
  renderWith({ by_card: byCard(100), total_earned_usd: 1.41, default_assumed_spend: 91.75 });
  expect(await screen.findByText(/Your cards would have earned about \$1\.41/)).toBeInTheDocument();
  expect(await screen.findByText(/Estimated: Freedom earned \$0\.90/)).toBeInTheDocument();
  expect(screen.queryByText(/^Actual:/)).not.toBeInTheDocument();
});

test('spend recorded against a card keeps "earned" and "Actual"', async () => {
  renderWith({ by_card: byCard(100), total_earned_usd: 1.41, default_assumed_spend: 0 });
  expect(await screen.findByText(/Your cards earned \$1\.41/)).toBeInTheDocument();
  expect(await screen.findByText(/Actual: Freedom earned/)).toBeInTheDocument();
});

test('a small assumed share (under half) still reads as earned', async () => {
  renderWith({ by_card: byCard(100), total_earned_usd: 1.41, default_assumed_spend: 20 });
  expect(await screen.findByText(/Your cards earned \$1\.41/)).toBeInTheDocument();
});

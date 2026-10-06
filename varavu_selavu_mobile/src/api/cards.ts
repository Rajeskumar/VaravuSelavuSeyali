import { apiFetch } from './apiFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardRewardType = 'cashback' | 'points' | 'miles';

export interface CardEarningRuleDTO {
    id: string;
    // Exactly one of these is set — a merchant rule always takes precedence over a category rule
    // when both could apply to the same spend.
    category_id: string | null; // bare sub-category string (matches expense categories), or "All Purchases"
    merchant_name: string | null;
    multiplier: number;
    cap_amount: number | null;
    cap_period: string | null;
    exclusions_note: string | null;
    rotation_start: string | null;
    rotation_end: string | null;
}

export interface CardCatalogSummary {
    id: string;
    issuer: string;
    card_name: string;
    reward_type: CardRewardType;
    annual_fee: number;
    is_custom: boolean;
}

export interface CardCatalogDetail extends CardCatalogSummary {
    points_currency_name: string | null;
    point_value_estimate_usd: number | null;
    earning_rules: CardEarningRuleDTO[];
    source_url: string | null;
    last_verified_at: string | null;
    is_active: boolean;
}

export interface CardRefDTO {
    id: string;
    card_name: string;
    issuer: string;
}

export interface UserCardDTO {
    id: string; // user_cards.id
    card_id: string;
    issuer: string;
    card_name: string;
    reward_type: CardRewardType;
    is_default: boolean;
    is_custom: boolean;
    added_at: string;
}

export interface CardCoachCategoryDTO {
    category: string;
    actual_spend: number;
    spend_source: 'personal_plus_group_paid' | 'personal_only';
    actual_earned_estimate: number | null;
    held_card_used: string | null;
    // Deliberately category-only, never merchant-aware — see CardCoachResponse.by_merchant for
    // the precedence-correct per-merchant comparison instead.
    optimal_in_wallet_card: string | null;
    optimal_in_wallet_earned_estimate: number | null;
    optimal_catalog_card: string | null;
    optimal_catalog_earned_estimate: number | null;
    cap_note: string | null;
    // Phase 2 "better card" nudge: false when a different held card would already do better —
    // an actionable switch, no new card needed, distinct from the aspirational catalog comparison.
    is_using_best_held_card: boolean;
}

export interface CardCoachMerchantDTO {
    merchant: string;
    actual_spend: number;
    spend_source: 'personal_plus_group_paid' | 'personal_only';
    actual_earned_estimate: number | null;
    held_card_used: string | null;
    optimal_in_wallet_card: string | null;
    optimal_in_wallet_earned_estimate: number | null;
    optimal_catalog_card: string | null;
    optimal_catalog_earned_estimate: number | null;
    cap_note: string | null;
    is_using_best_held_card: boolean;
}

export interface CardCoachCardDTO {
  card_id: string;
  card_name: string;
  reward_type: 'cashback' | 'points' | 'miles' | string;
  spend: number;
  earned_raw: number; // dollars for cashback, points/miles otherwise
  earned_usd: number | null; // null for points/miles cards with no point value
  effective_rate: number | null; // percent of spend returned
  top_category: string | null;
  is_default: boolean;
  still_held: boolean;
  cap_hit: boolean;
}

export interface CardCoachPeriodParams {
  year?: number;
  month?: number;
  start_date?: string;
  end_date?: string;
}

export interface CardCoachResponse {
  period: { year: number | null; month: number | null; start_date?: string | null; end_date?: string | null };
  total_estimated_gap: number;
  by_category: CardCoachCategoryDTO[];
  by_merchant: CardCoachMerchantDTO[];
  filter_info: { year: number | null; month: number | null; group_share_included: boolean };
  // "Which card benefited me most" — best first.
  by_card: CardCoachCardDTO[];
  total_earned_usd: number;
  best_card_id: string | null;
  unassigned_spend: number;
  /** Spend with no card recorded, priced as if it went on the default card (an estimate). */
  default_assumed_spend?: number;
  /** Rent/mortgage spend left out of the coach (rarely payable by card without a fee). */
  excluded_spend?: number;
}

export interface CardCorrectionDTO {
    id: string;
    card_id: string;
    note: string;
    status: string;
    created_at: string;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function searchCardCatalog(q?: string): Promise<CardCatalogSummary[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    const res = await apiFetch(`/api/v1/cards/catalog${qs}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to search card catalog');
    return res.json();
}

export async function getCardCatalogDetail(cardId: string): Promise<CardCatalogDetail> {
    const res = await apiFetch(`/api/v1/cards/catalog/${cardId}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load card detail');
    return res.json();
}

// ─── Held cards ───────────────────────────────────────────────────────────────

export async function listMyCards(): Promise<UserCardDTO[]> {
    const res = await apiFetch('/api/v1/cards/mine', { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load your cards');
    return res.json();
}

export async function addMyCard(cardId: string): Promise<UserCardDTO> {
    const res = await apiFetch('/api/v1/cards/mine', {
        method: 'POST',
        body: JSON.stringify({ card_id: cardId }),
    });
    if (!res.ok) throw new Error('Failed to add card');
    return res.json();
}

export interface CreateCustomCardPayload {
    card_name: string;
    issuer?: string;
    annual_fee?: number;
    rules: { category_id: string; multiplier: number }[];
}

export async function createCustomCard(payload: CreateCustomCardPayload): Promise<UserCardDTO> {
    const res = await apiFetch('/api/v1/cards/custom', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to add custom card');
    return res.json();
}

export async function removeMyCard(userCardId: string): Promise<void> {
    const res = await apiFetch(`/api/v1/cards/mine/${userCardId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove card');
}

export async function setMyDefaultCard(userCardId: string): Promise<UserCardDTO> {
    const res = await apiFetch(`/api/v1/cards/mine/${userCardId}/set_default`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to set default card');
    return res.json();
}

// ─── Coach + corrections ────────────────────────────────────────────────────

/** Omit every param for all time. */
export async function getCardCoach(params?: CardCoachPeriodParams): Promise<CardCoachResponse> {
    const qs = new URLSearchParams();
    if (params?.year) qs.set('year', String(params.year));
    if (params?.month) qs.set('month', String(params.month));
    if (params?.start_date) qs.set('start_date', params.start_date);
    if (params?.end_date) qs.set('end_date', params.end_date);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiFetch(`/api/v1/cards/coach${suffix}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load Card Coach analysis');
    return res.json();
}

export type CardCoachPreset = 'all' | '12m' | 'ytd' | 'month';

export const CARD_COACH_PRESETS: { value: CardCoachPreset; label: string; phrase: string }[] = [
  { value: 'all', label: 'All time', phrase: 'all time' },
  { value: '12m', label: '12 months', phrase: 'in the last 12 months' },
  { value: 'ytd', label: 'This year', phrase: 'this year' },
  { value: 'month', label: 'This month', phrase: 'this month' },
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Period preset -> /cards/coach params, in the user's local calendar (mirrors web api/cards.ts). */
export function cardCoachPeriodParams(preset: CardCoachPreset, now: Date = new Date()): CardCoachPeriodParams {
  switch (preset) {
    case 'month':
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
    case 'ytd':
      return { year: now.getFullYear() };
    case '12m': {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
      // end_date is compared against a timestamp, so use tomorrow's date to include all of today.
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { start_date: isoDate(start), end_date: isoDate(end) };
    }
    default:
      return {};
  }
}

export async function fileCardCorrection(cardId: string, note: string): Promise<CardCorrectionDTO> {
    const res = await apiFetch('/api/v1/cards/corrections', {
        method: 'POST',
        body: JSON.stringify({ card_id: cardId, note }),
    });
    if (!res.ok) throw new Error('Failed to file correction');
    return res.json();
}

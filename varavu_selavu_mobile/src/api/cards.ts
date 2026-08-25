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

export interface CardCoachResponse {
    period: { year: number | null; month: number | null };
    total_estimated_gap: number;
    by_category: CardCoachCategoryDTO[];
    by_merchant: CardCoachMerchantDTO[];
    filter_info: { year: number | null; month: number | null; group_share_included: boolean };
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

export async function getCardCoach(params?: { year?: number; month?: number }): Promise<CardCoachResponse> {
    const qs = new URLSearchParams();
    if (params?.year) qs.set('year', String(params.year));
    if (params?.month) qs.set('month', String(params.month));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiFetch(`/api/v1/cards/coach${suffix}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load Card Coach analysis');
    return res.json();
}

export async function fileCardCorrection(cardId: string, note: string): Promise<CardCorrectionDTO> {
    const res = await apiFetch('/api/v1/cards/corrections', {
        method: 'POST',
        body: JSON.stringify({ card_id: cardId, note }),
    });
    if (!res.ok) throw new Error('Failed to file correction');
    return res.json();
}

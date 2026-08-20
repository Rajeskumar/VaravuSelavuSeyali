/**
 * CardsTabContent.tsx — TS-CARD-111 mobile parity for web's CardsTab.tsx/CardDetailDialog.tsx.
 * Rendered as a 5th embedded pane inside AnalysisScreen.tsx (same "switch in place" pattern
 * BudgetsTabContent.tsx already established there — see that file's own doc comment).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  listMyCards, addMyCard, removeMyCard, setMyDefaultCard, searchCardCatalog, getCardCoach,
  getCardCatalogDetail, fileCardCorrection,
  UserCardDTO, CardCatalogSummary, CardCoachCategoryDTO, CardCatalogDetail,
} from '../api/cards';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { ListSkeleton } from './SkeletonLoader';

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function CardsTabContent() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const { data: myCards = [], isLoading: cardsLoading } = useQuery({ queryKey: ['cards-mine'], queryFn: listMyCards });
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['card-catalog-search', search],
    queryFn: () => searchCardCatalog(search || undefined),
    enabled: pickerOpen,
  });

  const now = new Date();
  const { data: coach, isLoading: coachLoading } = useQuery({
    queryKey: ['card-coach', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getCardCoach({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    enabled: myCards.length > 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cards-mine'] });
    qc.invalidateQueries({ queryKey: ['card-coach'] });
  };
  const addMut = useMutation({ mutationFn: (id: string) => addMyCard(id), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (id: string) => removeMyCard(id), onSuccess: invalidate });
  const defaultMut = useMutation({ mutationFn: (id: string) => setMyDefaultCard(id), onSuccess: invalidate });

  const heldCardIds = new Set(myCards.map((c) => c.card_id));
  const busy = addMut.isPending || removeMut.isPending || defaultMut.isPending;

  const picker = pickerOpen && (
    <View style={{ marginTop: 8 }}>
      <TextInput
        style={styles.input}
        placeholder="Search by issuer or card name…"
        placeholderTextColor={theme.colors.textTertiary}
        value={search}
        onChangeText={setSearch}
        autoFocus
      />
      {searching && <ActivityIndicator style={{ marginVertical: 12 }} color={theme.colors.primary} />}
      {!searching && searchResults.length === 0 && (
        <Text style={styles.emptyHint}>{search ? 'No matching cards in the catalog.' : 'Type to search the card catalog.'}</Text>
      )}
      <View style={{ gap: 8, marginTop: 8 }}>
        {searchResults.map((c: CardCatalogSummary) => (
          <View key={c.id} style={styles.searchRow}>
            <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => setDetailCardId(c.id)} activeOpacity={0.7}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.issuer} {c.card_name}</Text>
              <Text style={styles.rowSubtitle}>{c.reward_type}{c.annual_fee > 0 ? ` · $${c.annual_fee.toFixed(0)}/yr` : ' · no annual fee'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addChip, heldCardIds.has(c.id) && styles.addChipDisabled]}
              disabled={heldCardIds.has(c.id) || addMut.isPending}
              onPress={() => addMut.mutate(c.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.addChipText}>{heldCardIds.has(c.id) ? 'Added' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  if (cardsLoading) {
    return (
      <View style={styles.section}>
        <ListSkeleton count={2} />
      </View>
    );
  }

  if (myCards.length === 0) {
    return (
      <View style={styles.section}>
        {!pickerOpen && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>💳</Text>
            <Text style={styles.emptyTitle}>Add the cards you carry</Text>
            <Text style={styles.emptySubtitle}>See how they're performing against what you spend.</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>+ Add a card</Text>
            </TouchableOpacity>
          </View>
        )}
        {picker}
        <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} theme={theme} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.summaryText}>Your cards</Text>
        <TouchableOpacity style={styles.addBtnSmall} onPress={() => setPickerOpen((o) => !o)} activeOpacity={0.8}>
          <Text style={styles.addBtnSmallText}>+ Add another</Text>
        </TouchableOpacity>
      </View>

      <View style={{ gap: 0 }}>
        {myCards.map((c) => (
          <View key={c.id} style={styles.heldRow}>
            <TouchableOpacity
              onPress={() => !c.is_default && defaultMut.mutate(c.id)}
              disabled={busy || c.is_default}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={c.is_default ? 'Default card' : 'Set as default'}
            >
              <Ionicons
                name={c.is_default ? 'star' : 'star-outline'}
                size={18}
                color={c.is_default ? theme.colors.warning : theme.colors.textTertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, minWidth: 0, marginLeft: 10 }} onPress={() => setDetailCardId(c.card_id)} activeOpacity={0.7}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.issuer} {c.card_name}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeMut.mutate(c.id)} disabled={busy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {picker}

      {coachLoading && <ActivityIndicator style={{ marginVertical: 16 }} color={theme.colors.primary} />}
      {coach && (
        <>
          <View style={[styles.banner, coach.total_estimated_gap > 0 ? styles.bannerInfo : styles.bannerSuccess]}>
            <Text style={styles.bannerText}>
              {coach.total_estimated_gap > 0
                ? `You left an estimated ${formatMoney(coach.total_estimated_gap)} in rewards on the table this month, using cards you already hold.`
                : "You're using your best held card for every category with spend this month."}
            </Text>
          </View>

          {coach.by_category.length === 0 && (
            <Text style={styles.emptyHint}>No categorized spend yet this month.</Text>
          )}

          <View style={{ gap: 12, marginTop: 4 }}>
            {coach.by_category.map((row) => (
              <CategoryGapCard key={row.category} row={row} theme={theme} />
            ))}
          </View>
        </>
      )}

      <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} theme={theme} />
    </View>
  );
}

function CategoryGapCard({ row, theme }: { row: CardCoachCategoryDTO; theme: AppTheme }) {
  const styles = createStyles(theme);
  const gap = row.optimal_in_wallet_earned_estimate != null && row.actual_earned_estimate != null
    ? Math.max(row.optimal_in_wallet_earned_estimate - row.actual_earned_estimate, 0)
    : null;

  return (
    <View style={styles.gapCard}>
      <View style={styles.gapCardHeader}>
        <Text style={styles.cardTitle}>{row.category}</Text>
        <Text style={styles.footerText}>{formatMoney(row.actual_spend)} spent</Text>
      </View>
      <Text style={styles.gapLine}>
        Actual: {row.held_card_used ? `${row.held_card_used} earned ${formatMoney(row.actual_earned_estimate ?? 0)}` : 'no default card set'}
      </Text>
      {row.optimal_in_wallet_card && (
        <Text style={styles.gapLine}>Best you hold: {row.optimal_in_wallet_card} — {formatMoney(row.optimal_in_wallet_earned_estimate ?? 0)}</Text>
      )}
      {row.optimal_catalog_card && (
        <Text style={styles.gapLine}>Best in catalog: {row.optimal_catalog_card} — {formatMoney(row.optimal_catalog_earned_estimate ?? 0)}</Text>
      )}
      {gap != null && gap > 0 && (
        <View style={styles.gapChip}>
          <Text style={styles.gapChipText}>{formatMoney(gap)} left on the table</Text>
        </View>
      )}
      {row.cap_note && <Text style={styles.capNote}>{row.cap_note}</Text>}
    </View>
  );
}

function CardDetailModal({ cardId, onClose, theme }: { cardId: string | null; onClose: () => void; theme: AppTheme }) {
  const styles = createStyles(theme);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [filed, setFiled] = useState(false);

  const { data: card, isLoading } = useQuery<CardCatalogDetail>({
    queryKey: ['card-catalog-detail', cardId],
    queryFn: () => getCardCatalogDetail(cardId as string),
    enabled: !!cardId,
  });

  const reportMut = useMutation({
    mutationFn: () => fileCardCorrection(cardId as string, note.trim()),
    onSuccess: () => { setFiled(true); setReporting(false); setNote(''); },
  });

  const handleClose = () => {
    setReporting(false);
    setNote('');
    setFiled(false);
    onClose();
  };

  return (
    <Modal visible={!!cardId} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{card ? `${card.issuer} ${card.card_name}` : 'Card detail'}</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {isLoading && <ActivityIndicator style={{ marginVertical: 20 }} color={theme.colors.primary} />}
            {card && (
              <>
                <Text style={styles.rowSubtitle}>
                  {card.reward_type}{card.points_currency_name ? ` · ${card.points_currency_name}` : ''}
                  {card.annual_fee > 0 ? ` · $${card.annual_fee.toFixed(0)}/yr` : ' · no annual fee'}
                </Text>

                <View style={{ marginTop: 10, gap: 4 }}>
                  {card.earning_rules.map((r) => (
                    <Text key={r.id} style={styles.gapLine}>
                      {r.multiplier}x/% — {r.category_id}
                      {r.cap_amount ? ` (up to $${r.cap_amount.toLocaleString()}/${r.cap_period})` : ''}
                    </Text>
                  ))}
                  {card.earning_rules.length === 0 && <Text style={styles.gapLine}>No earning rules on file.</Text>}
                </View>

                <View style={styles.divider} />

                <Text style={styles.provenance}>
                  Source: {card.issuer} rates & terms · Verified {formatDate(card.last_verified_at)}
                </Text>

                {filed && (
                  <View style={[styles.banner, styles.bannerSuccess, { marginTop: 14 }]}>
                    <Text style={styles.bannerText}>Thanks — this has been flagged for manual review.</Text>
                  </View>
                )}

                {!filed && !reporting && (
                  <TouchableOpacity style={styles.reportBtn} onPress={() => setReporting(true)} activeOpacity={0.7}>
                    <Ionicons name="flag-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.reportBtnText}>Report incorrect info</Text>
                  </TouchableOpacity>
                )}

                {!filed && reporting && (
                  <View style={{ marginTop: 12 }}>
                    <TextInput
                      style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                      placeholder="What looks wrong? e.g. multiplier changed, category missing…"
                      placeholderTextColor={theme.colors.textTertiary}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      autoFocus
                    />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[styles.saveBtnSmall, (!note.trim() || reportMut.isPending) && styles.saveBtnDisabled]}
                        disabled={!note.trim() || reportMut.isPending}
                        onPress={() => reportMut.mutate()}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.saveBtnSmallText}>Submit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setReporting(false)} activeOpacity={0.7}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    {reportMut.isError && <Text style={styles.askWhyErrorText}>Failed to submit — try again.</Text>}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    section: { marginTop: 4, marginHorizontal: 18 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    summaryText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textSecondary },
    addBtnSmall: { paddingVertical: 4 },
    addBtnSmallText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.primary },
    addBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 14 },
    addBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.textInverse },

    heldRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    rowTitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.text },
    rowSubtitle: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textSecondary, marginTop: 2 },

    input: {
      backgroundColor: theme.colors.surfaceSecondary, borderRadius: 12, paddingHorizontal: 14,
      paddingVertical: 12, borderWidth: 1.5, borderColor: theme.colors.border,
      fontSize: 14, color: theme.colors.text,
    },
    emptyHint: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.textSecondary, textAlign: 'center', paddingVertical: 12 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight, borderRadius: 10, padding: 10,
    },
    addChip: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    addChipDisabled: { backgroundColor: theme.colors.surfaceSecondary },
    addChipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12, color: theme.colors.textInverse },

    emptyCard: {
      alignItems: 'center', paddingVertical: 30,
      backgroundColor: theme.colors.surface, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
    },
    emptyIcon: { fontSize: 34, marginBottom: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 4, textAlign: 'center' },
    emptySubtitle: { fontSize: 12.5, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

    banner: { borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 8 },
    bannerInfo: { backgroundColor: theme.colors.primarySurface },
    bannerSuccess: { backgroundColor: theme.colors.successSurface },
    bannerText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.text, lineHeight: 17 },

    gapCard: {
      backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight, borderRadius: 14, padding: 14,
    },
    gapCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    cardTitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text },
    gapLine: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    footerText: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textTertiary },
    gapChip: { alignSelf: 'flex-start', backgroundColor: theme.colors.warningSurface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
    gapChipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11.5, color: theme.colors.warning },
    capNote: { fontFamily: 'InstrumentSans-Regular', fontStyle: 'italic', fontSize: 10.5, color: theme.colors.textTertiary, marginTop: 8 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: {
      backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40, maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, flex: 1 },
    modalClose: { fontSize: 20, color: theme.colors.textTertiary, padding: 4 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.borderLight, marginVertical: 14 },
    provenance: { fontFamily: 'InstrumentSans-Regular', fontSize: 11, color: theme.colors.textTertiary },

    reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
    reportBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textSecondary },
    saveBtnSmall: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnSmallText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textInverse },
    cancelText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textSecondary, paddingVertical: 8 },
    askWhyErrorText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.error, marginTop: 8 },
  });

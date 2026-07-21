import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import { MemberDTO, GroupExpenseItemEntry, SplitSuggestionDTO, suggestItemAssignment } from '../api/groups';
import { memberColor } from './BalanceRow';

interface Props {
  items: GroupExpenseItemEntry[];
  members: MemberDTO[];
  onChange: (items: GroupExpenseItemEntry[]) => void;
  onValidityChange?: (valid: boolean) => void;
  /** TS-GRP-133: when provided, unassigned items are checked against group
   * history and a suggestion chip is offered — tapping it only pre-fills the
   * assignment, never auto-submits. */
  groupId?: string;
}

export default function ItemSplitBoard({
  items,
  members,
  onChange,
  onValidityChange,
  groupId,
}: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const activeMembers = members.filter((m) => m.status === 'active');
  const [suggestions, setSuggestions] = React.useState<Record<string, SplitSuggestionDTO[]>>({});

  React.useEffect(() => {
    if (!groupId) return;
    items.forEach((item) => {
      const key = item.item_name;
      if (Object.keys(item.member_ratios).length > 0) return;
      if (suggestions[key] !== undefined) return;
      suggestItemAssignment(groupId, key)
        .then((s) => setSuggestions((prev) => ({ ...prev, [key]: s })))
        .catch(() => setSuggestions((prev) => ({ ...prev, [key]: [] })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, items]);

  const isValid = items.every((item) => {
    const assignedIds = Object.keys(item.member_ratios);
    return assignedIds.length > 0 && assignedIds.some((id) => item.member_ratios[id] > 0);
  });

  React.useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const toggleMemberForItem = (lineNo: number, memberId: string, isSelected: boolean) => {
    onChange(
      items.map((item) => {
        if (item.line_no !== lineNo) return item;
        const newRatios = { ...item.member_ratios };
        if (!isSelected) {
          // Add member. We balance evenly by default among selected.
          newRatios[memberId] = 1;
          // equalize all to 1 (which means equal shares)
          Object.keys(newRatios).forEach((id) => {
            newRatios[id] = 1;
          });
        } else {
          delete newRatios[memberId];
        }
        return { ...item, member_ratios: newRatios };
      })
    );
  };

  const updateRatioForItem = (lineNo: number, memberId: string, ratioStr: string) => {
    const ratio = parseFloat(ratioStr) || 0;
    onChange(
      items.map((item) => {
        if (item.line_no !== lineNo) return item;
        const newRatios = { ...item.member_ratios, [memberId]: Math.max(0, ratio) };
        return { ...item, member_ratios: newRatios };
      })
    );
  };

  return (
    <View style={styles.container}>
      {items.map((item) => {
        const assignedIds = Object.keys(item.member_ratios);
        const hasAssignment = assignedIds.length > 0;
        const sumRatios = Object.values(item.member_ratios).reduce((sum, r) => sum + r, 0);

        return (
          <View
            key={item.line_no}
            style={[
              styles.itemCard,
              !hasAssignment && styles.itemCardError,
            ]}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemName} numberOfLines={1}>{item.item_name}</Text>
              <Text style={styles.itemTotal}>${item.line_total.toFixed(2)}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberList}>
              {activeMembers.map((m) => {
                const isSelected = item.member_ratios[m.member_id] !== undefined;
                return (
                  <TouchableOpacity
                    key={m.member_id}
                    style={[
                      styles.memberChip,
                      isSelected && styles.memberChipSelected,
                      isSelected && { borderColor: memberColor(m.member_id) },
                    ]}
                    onPress={() => toggleMemberForItem(item.line_no, m.member_id, isSelected)}
                  >
                    <View style={[styles.avatarBox, { backgroundColor: memberColor(m.member_id) }]}>
                      <Text style={styles.avatarText}>
                        {m.display_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.memberChipText, isSelected && styles.memberChipTextSelected]}>
                      {m.display_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!hasAssignment && suggestions[item.item_name]?.[0] && (
              <TouchableOpacity
                style={styles.suggestionChip}
                onPress={() => toggleMemberForItem(item.line_no, suggestions[item.item_name][0].member_id, false)}
              >
                <Text style={styles.suggestionChipText}>
                  Suggested: {suggestions[item.item_name][0].display_name}
                </Text>
              </TouchableOpacity>
            )}

            {/* Custom Ratio Tuning */}
            {assignedIds.length > 1 && (
              <View style={styles.ratioSection}>
                <Text style={styles.ratioLabel}>Adjust Shares (Total: {sumRatios})</Text>
                <View style={styles.ratioList}>
                  {assignedIds.map((id) => {
                    const member = activeMembers.find((m) => m.member_id === id);
                    if (!member) return null;
                    return (
                      <View key={id} style={styles.ratioRow}>
                        <Text style={styles.ratioMemberName} numberOfLines={1}>{member.display_name}</Text>
                        <TextInput
                          style={styles.ratioInput}
                          keyboardType="numeric"
                          value={item.member_ratios[id]?.toString() || '0'}
                          onChangeText={(text) => updateRatioForItem(item.line_no, id, text)}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {!hasAssignment && (
              <Text style={styles.errorText}>
                Item must be assigned to at least one person
              </Text>
            )}
          </View>
        );
      })}

      {isValid && (
        <Text style={styles.successText}>All items assigned ✓</Text>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      marginTop: 8,
      marginBottom: 8,
    },
    itemCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    itemCardError: {
      borderColor: theme.colors.error,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    itemName: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 16,
      color: theme.colors.text,
      flex: 1,
      marginRight: 8,
    },
    itemTotal: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 16,
      color: theme.colors.text,
    },
    memberList: {
      gap: 8,
      paddingBottom: 4,
    },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 12,
      paddingLeft: 4,
      paddingVertical: 4,
      borderRadius: 20,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
    },
    memberChipSelected: {
      backgroundColor: `${theme.colors.primary}10`,
    },
    avatarBox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    // memberColor() avatar palette is fixed pastel in both modes — ink text always.
    avatarText: {
      color: inkOnPastel,
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 10,
    },
    memberChipText: {
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    memberChipTextSelected: {
      color: theme.colors.text,
      fontFamily: 'InstrumentSans-SemiBold',
    },
    ratioSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.borderLight,
    },
    ratioLabel: {
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 12,
      color: theme.colors.textTertiary,
      marginBottom: 8,
    },
    ratioList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    ratioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      borderRadius: 8,
      padding: 6,
      paddingHorizontal: 8,
    },
    ratioMemberName: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13,
      color: theme.colors.text,
      marginRight: 8,
      maxWidth: 80,
    },
    ratioInput: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      borderRadius: 4,
      width: 48,
      height: 28,
      textAlign: 'center',
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 13,
      padding: 0,
      color: theme.colors.text,
    },
    suggestionChip: {
      alignSelf: 'flex-start',
      backgroundColor: `${theme.colors.primary}15`,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    suggestionChipText: {
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 12,
      color: theme.colors.primary,
    },
    errorText: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 12,
      color: theme.colors.error,
      marginTop: 8,
    },
    successText: {
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 13,
      color: theme.colors.success,
      textAlign: 'center',
      marginTop: 4,
    },
  });

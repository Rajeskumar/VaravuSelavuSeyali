import React, { useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import Chip from './Chip';
import OptionSheet from './OptionSheet';
import { recentMonths } from '../utils/insightsFormat';
import { MAIN_CATEGORIES } from '../constants/categories';
import { listTags } from '../api/tags';
import { SpendScope } from '../utils/spendFilters';

interface Props {
  month: string;
  onMonth: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  tagIds: string[];
  onTagIds: (v: string[]) => void;
  scope: SpendScope;
  onScope: (v: SpendScope) => void;
  tagsEnabled: boolean;
  showScope: boolean;
}

type Sheet = 'month' | 'category' | 'tags' | 'scope' | null;

const SCOPE_LABEL: Record<SpendScope, string> = { all: 'Everything', personal: 'Personal', groups: 'Group shares' };

/** The Spend screen's filter row: month (solid, the always-on one) · Category · Tags · Scope. Each
 * opens a sheet; a chip that has a value shows it and reads as active (violet). */
export default function SpendFilterChips({ month, onMonth, category, onCategory, tagIds, onTagIds, scope, onScope, tagsEnabled, showScope }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState<Sheet>(null);
  const months = useMemo(() => recentMonths(new Date()), []);
  const { data: tags = [] } = useQuery({ queryKey: ['tags', 'autocomplete'], queryFn: () => listTags({ status: 'active' }), enabled: tagsEnabled });

  const monthLabel = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleString('en-US', { month: 'long' }) : 'All time';
  const clear = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 14 }} accessibilityRole="button">
      <Text style={styles.clear}>Clear</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
        <Chip label={monthLabel} variant="solid" onPress={() => setOpen('month')} />
        <Chip label={category || 'Category'} variant={category ? 'accent' : 'outline'} onPress={() => setOpen('category')} />
        {tagsEnabled && <Chip label={tagIds.length ? `Tags · ${tagIds.length}` : 'Tags'} variant={tagIds.length ? 'accent' : 'outline'} onPress={() => setOpen('tags')} />}
        {showScope && <Chip label={scope === 'all' ? 'Scope' : SCOPE_LABEL[scope]} variant={scope === 'all' ? 'outline' : 'accent'} onPress={() => setOpen('scope')} />}
      </ScrollView>

      <OptionSheet
        visible={open === 'month'}
        title="Month"
        options={[{ value: '', label: 'All time' }, ...months.map((m) => ({ value: m.value, label: m.label }))]}
        selected={month}
        onSelect={(v) => { onMonth(v); setOpen(null); }}
        onClose={() => setOpen(null)}
      />
      <OptionSheet
        visible={open === 'category'}
        title="Category"
        options={MAIN_CATEGORIES.map((c) => ({ value: c, label: c }))}
        selected={category}
        onSelect={(v) => { onCategory(v === category ? '' : v); setOpen(null); }}
        onClose={() => setOpen(null)}
        footer={category ? clear(() => { onCategory(''); setOpen(null); }) : undefined}
      />
      <OptionSheet
        visible={open === 'tags'}
        title="Tags"
        options={tags.map((t) => ({ value: t.id, label: t.name }))}
        selectedMany={tagIds}
        onSelect={(v) => onTagIds(tagIds.includes(v) ? tagIds.filter((x) => x !== v) : [...tagIds, v])}
        onClose={() => setOpen(null)}
        footer={tagIds.length ? clear(() => onTagIds([])) : undefined}
      />
      <OptionSheet
        visible={open === 'scope'}
        title="Scope"
        options={(['all', 'personal', 'groups'] as SpendScope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
        selected={scope}
        onSelect={(v) => { onScope(v); setOpen(null); }}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: 12 },
  row: { gap: 8, paddingRight: 22 },
  clear: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.primary, textAlign: 'center' },
});

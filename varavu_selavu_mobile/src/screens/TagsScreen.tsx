/**
 * TagsScreen.tsx — Account → Categories & tags. Tags are yours to create, rename, recolor, archive
 * and delete; categories are the app's fixed set, shown read-only so it's clear what the
 * pickers offer.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import FieldBox from '../components/FieldBox';
import Sheet from '../components/Sheet';
import { ListSkeleton } from '../components/SkeletonLoader';
import { useTagsEnabled } from '../hooks/useTagsEnabled';
import { listTags, createTag, updateTag, deleteTag, TagDTO } from '../api/tags';
import { CATEGORY_GROUPS } from '../constants/categories';

const SWATCHES = ['#AEA5FF', '#00E0E0', '#FBBF24', '#4ADE80', '#F87171', '#EF8BC5', '#7C72E8', '#94A3B8'];

export default function TagsScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();
  const { enabled: tagsEnabled } = useTagsEnabled();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags-all'],
    queryFn: () => listTags({ status: 'all' }),
    enabled: tagsEnabled,
  });

  // `editing`: null = sheet closed, 'new' = creating, else the tag being edited.
  const [editing, setEditing] = useState<TagDTO | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);

  const open = (t: TagDTO | 'new') => {
    setEditing(t);
    setName(t === 'new' ? '' : t.name);
    setColor(t === 'new' ? SWATCHES[0] : t.color);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tags-all'] });
    qc.invalidateQueries({ queryKey: ['tags'] });
  };
  const onError = (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');

  const saveMut = useMutation({
    mutationFn: () => {
      const trimmed = name.trim();
      return editing === 'new' || editing === null
        ? createTag({ name: trimmed, color })
        : updateTag(editing.id, { name: trimmed, color });
    },
    onSuccess: () => { refresh(); setEditing(null); },
    onError,
  });
  const archiveMut = useMutation({
    mutationFn: (t: TagDTO) => updateTag(t.id, { status: t.status === 'Archived' ? 'Active' : 'Archived' }),
    onSuccess: () => { refresh(); setEditing(null); },
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: (t: TagDTO) => deleteTag(t.id),
    onSuccess: () => { refresh(); setEditing(null); },
    onError,
  });

  const confirmDelete = (t: TagDTO) =>
    Alert.alert(`Delete "${t.name}"?`, 'It is removed from every expense it was on. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(t) },
    ]);

  const active = tags.filter((t) => t.status !== 'Archived');
  const archived = tags.filter((t) => t.status === 'Archived');
  const canSave = name.trim().length > 0 && !saveMut.isPending;
  const editingTag = editing && editing !== 'new' ? editing : null;

  const renderTag = (t: TagDTO) => (
    <TouchableOpacity key={t.id} style={styles.row} activeOpacity={0.6} onPress={() => open(t)}>
      <View style={[styles.dot, { backgroundColor: t.color }]} />
      <Text style={[styles.rowName, t.status === 'Archived' && { color: theme.colors.textTertiary }]} numberOfLines={1}>{t.name}</Text>
      <Text style={styles.hint}>{t.usage_count} expense{t.usage_count === 1 ? '' : 's'}</Text>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Categories & tags" back />

      {tagsEnabled && (
        <>
          <SectionLabel style={styles.label}>Tags</SectionLabel>
          {isLoading ? <ListSkeleton count={3} /> : active.length === 0 ? (
            <Text style={styles.empty}>No tags yet. Tags let you slice spending across categories — “Trip”, “Reimbursable”.</Text>
          ) : active.map(renderTag)}
          <TouchableOpacity onPress={() => open('new')} activeOpacity={0.7} style={styles.newBtn} accessibilityRole="button">
            <Text style={styles.newBtnText}>+ New tag</Text>
          </TouchableOpacity>
          {archived.length > 0 && (
            <>
              <SectionLabel style={styles.label}>Archived</SectionLabel>
              {archived.map(renderTag)}
            </>
          )}
        </>
      )}

      <SectionLabel style={styles.label}>Categories</SectionLabel>
      {Object.entries(CATEGORY_GROUPS).map(([main, subs]) => (
        <View key={main} style={styles.catRow}>
          <Text style={styles.rowName}>{main}</Text>
          <Text style={styles.catSubs} numberOfLines={2}>{subs.join(' · ')}</Text>
        </View>
      ))}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <Text style={styles.sheetTitle}>{editing === 'new' ? 'New tag' : 'Edit tag'}</Text>
        <FieldBox label="Name" value={name} onChangeText={setName} placeholder="Trip" autoFocus={editing === 'new'} maxLength={40} />
        <SectionLabel style={{ marginTop: 16, marginBottom: 10 }}>Color</SectionLabel>
        <View style={styles.swatches}>
          {SWATCHES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c}`}
              accessibilityState={{ selected: color === c }}
              style={[styles.swatch, { backgroundColor: c }, color === c && { borderColor: theme.colors.text }]}
            />
          ))}
        </View>
        <TouchableOpacity
          onPress={() => saveMut.mutate()}
          disabled={!canSave}
          activeOpacity={0.85}
          style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, !canSave && { opacity: 0.5 }]}
        >
          {saveMut.isPending ? <ActivityIndicator color={inkOnPastel} /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
        {editingTag && (
          <View style={styles.sheetFoot}>
            <TouchableOpacity onPress={() => archiveMut.mutate(editingTag)} activeOpacity={0.7} style={styles.footBtn}>
              <Text style={styles.footText}>{editingTag.status === 'Archived' ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(editingTag)} activeOpacity={0.7} style={styles.footBtn}>
              <Text style={[styles.footText, { color: theme.colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </Sheet>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  label: { marginTop: 22, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { flex: 1, fontFamily: 'InstrumentSans-Medium', fontSize: 15, color: theme.colors.text },
  hint: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textTertiary },
  empty: { fontFamily: 'InstrumentSans-Regular', fontSize: 13.5, lineHeight: 19, color: theme.colors.textTertiary, paddingVertical: 12 },
  newBtn: { alignSelf: 'flex-start', paddingVertical: 14 },
  newBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.primary },
  catRow: { paddingVertical: 12, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  catSubs: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, lineHeight: 17, color: theme.colors.textTertiary },
  sheetTitle: { fontFamily: theme.typography.fontFamily.display, fontSize: 22, letterSpacing: -0.6, color: theme.colors.text, marginBottom: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  saveBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  saveText: { fontFamily: 'InstrumentSans-Bold', fontSize: 16, color: inkOnPastel },
  sheetFoot: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  footBtn: { paddingVertical: 14, paddingHorizontal: 12 },
  footText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.textSecondary },
});

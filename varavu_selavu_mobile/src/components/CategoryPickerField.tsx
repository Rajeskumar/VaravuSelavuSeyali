/**
 * CategoryPickerField.tsx — tap-to-open category picker for Quick Capture (mirrors web's
 * CategoryPickerField.tsx: a compact field that opens a main-category chip row + subcategory
 * list). Modal-based bottom sheet, matching this app's existing Modal conventions
 * (TypeaheadInput.tsx, GroupSettingsSheet.tsx) rather than AddExpenseScreen's old always-inline
 * double-chip-row style — Quick Capture is already keypad-driven and space-constrained, so an
 * inline picker would crowd it.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppTheme } from '../theme';
import { CATEGORY_GROUPS, MAIN_CATEGORIES, findMainCategory } from '../constants/categories';

interface CategoryPickerFieldProps {
  theme: AppTheme;
  mainCategory: string;
  subcategory: string;
  onChange: (mainCategory: string, subcategory: string) => void;
  label?: string;
  containerStyle?: any;
}

const CategoryPickerField: React.FC<CategoryPickerFieldProps> = ({
  theme,
  mainCategory,
  subcategory,
  onChange,
  label = 'Category',
  containerStyle,
}) => {
  const resolvedMain = mainCategory && CATEGORY_GROUPS[mainCategory] ? mainCategory : findMainCategory(subcategory);
  const [visible, setVisible] = useState(false);
  const [pickerMain, setPickerMain] = useState(resolvedMain);
  const styles = createStyles(theme);

  const open = () => {
    setPickerMain(resolvedMain);
    setVisible(true);
  };

  const select = (sub: string) => {
    onChange(pickerMain, sub);
    setVisible(false);
  };

  return (
    <View style={containerStyle}>
      <TouchableOpacity style={styles.field} onPress={open} activeOpacity={0.7}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {subcategory ? `${resolvedMain} · ${subcategory}` : 'Choose a category'}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dragPillWrap}>
              <View style={styles.dragPill} />
            </View>
            <Text style={styles.sheetTitle}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mainRow}
            >
              {MAIN_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.mainChip, cat === pickerMain && styles.mainChipActive]}
                  onPress={() => setPickerMain(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.mainChipText, cat === pickerMain && styles.mainChipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView style={styles.subList} keyboardShouldPersistTaps="handled">
              {CATEGORY_GROUPS[pickerMain].map((sub) => (
                <TouchableOpacity
                  key={sub}
                  style={styles.subRow}
                  onPress={() => select(sub)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.subRowText, pickerMain === resolvedMain && sub === subcategory && styles.subRowTextActive]}>
                    {sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    fieldLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: theme.colors.textSecondary },
    fieldValue: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: theme.colors.text, marginTop: 1 },
    chevron: { fontSize: 18, color: theme.colors.textTertiary, marginLeft: 8 },

    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,27,0.4)' },
    sheet: {
      maxHeight: '70%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingBottom: 24,
    },
    dragPillWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    dragPill: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderLight },
    sheetTitle: { fontFamily: 'Inter-Bold', fontSize: 15, color: theme.colors.text, marginTop: 6, marginBottom: 10 },

    mainRow: { gap: 6, paddingBottom: 10 },
    mainChip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
      borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface,
    },
    mainChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    mainChipText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.text },
    mainChipTextActive: { color: '#FFFFFF' },

    subList: { marginTop: 2 },
    subRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    subRowText: { fontFamily: 'Inter-Regular', fontSize: 14, color: theme.colors.text },
    subRowTextActive: { fontFamily: 'Inter-SemiBold', color: theme.colors.primary },
  });

export default CategoryPickerField;

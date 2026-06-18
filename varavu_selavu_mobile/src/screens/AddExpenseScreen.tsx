import React, { useState, useRef, useCallback, createContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal, Animated,
  Dimensions, Pressable, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { addExpense, categorizeExpense } from '../api/expenses';
import { CATEGORY_GROUPS, MAIN_CATEGORIES } from '../constants/categories';
import { theme } from '../theme';
import CustomButton from '../components/CustomButton';
import { showToast } from '../components/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_H } = Dimensions.get('window');

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

export interface AddExpenseContextType {
  openAddExpense: () => void;
  closeAddExpense: () => void;
}

export const AddExpenseContext = createContext<AddExpenseContextType>({
  openAddExpense: () => {},
  closeAddExpense: () => {},
});

export default function AddExpenseProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  // Sheet starts fully off screen at the bottom
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [mainCategory, setMainCategory] = useState(MAIN_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
  const [date, setDate] = useState(todayMMDDYYYY());
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [merchantName, setMerchantName] = useState('');
  const [userPickedMerchant, setUserPickedMerchant] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { accessToken, userEmail } = useAuth();
  const insets = useSafeAreaInsets();

  const openAddExpense = useCallback(() => {
    setVisible(true);
    // Animate simultaneously: slide sheet up + fade backdrop
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const closeAddExpense = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_H,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      resetForm();
    });
  }, []);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setMerchantName('');
    setUserPickedMerchant(false);
    setDate(todayMMDDYYYY());
    setMainCategory(MAIN_CATEGORIES[0]);
    setSubcategory(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
  };

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 3) {
      debounceRef.current = setTimeout(async () => {
        try {
          setCategorizing(true);
          const result = await categorizeExpense(text.trim());
          const mc = result.main_category || '';
          const sub = result.subcategory || '';
          if (mc && CATEGORY_GROUPS[mc]) {
            setMainCategory(mc);
            setSubcategory(CATEGORY_GROUPS[mc].includes(sub) ? sub : CATEGORY_GROUPS[mc][0]);
          }
          if (!userPickedMerchant && result.merchant_name) setMerchantName(result.merchant_name);
        } catch { }
        finally { setCategorizing(false); }
      }, 800);
    }
  }, [userPickedMerchant]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      showToast({ message: 'Please enter a description', type: 'warning' });
      return;
    }
    if (!amount.trim() || isNaN(parseFloat(amount))) {
      showToast({ message: 'Please enter a valid amount', type: 'warning' });
      return;
    }
    if (!accessToken || !userEmail) return;
    setLoading(true);
    try {
      await addExpense({
        description,
        cost: parseFloat(amount),
        category: subcategory,
        sub_category: subcategory,
        date,
        user_id: userEmail,
        merchant_name: merchantName || undefined,
      }, accessToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ message: 'Expense saved', type: 'success' });
      closeAddExpense();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ message: error.message || 'Failed to save', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const currentSubs = CATEGORY_GROUPS[mainCategory] || [];
  // Sheet height: 88% of screen, minimum so content fits
  const SHEET_H = SCREEN_H * 0.88;

  return (
    <AddExpenseContext.Provider value={{ openAddExpense, closeAddExpense }}>
      {children}

      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={closeAddExpense}
        statusBarTranslucent
      >
        {/* Full-screen container — FLEX layout avoids KeyboardAvoidingView issues */}
        <View style={styles.modalRoot}>

          {/* ── Tappable backdrop ── */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAddExpense}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: 'rgba(0,0,0,0.52)' }]} />
          </Pressable>

          {/* ── The Sheet — absolutely pinned to the bottom ── */}
          <Animated.View
            style={[
              styles.sheet,
              {
                height: SHEET_H,
                bottom: 0,
                paddingBottom: Math.max(insets.bottom, 20),
                transform: [{ translateY }],
              },
            ]}
          >
            {/* Drag pill */}
            <View style={styles.dragPillWrap}>
              <View style={styles.dragPill} />
            </View>

            {/* iOS-style sheet header: Cancel | Title | (space) */}
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                onPress={closeAddExpense}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.6}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>New Expense</Text>
              {/* Right spacer to keep title centered */}
              <Text style={[styles.cancelText, { opacity: 0 }]}>Cancel</Text>
            </View>

            {/* ── Scrollable body ── */}
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
            >
              {/* Amount hero */}
              <View style={styles.amountRow}>
                <Text style={styles.dollarSign}>$</Text>
                <RNTextInput
                  style={styles.amountField}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textQuaternary}
                  selectionColor={theme.colors.primary}
                  autoFocus
                />
              </View>

              {/* Inset-grouped form (iOS Settings style) */}
              <View style={styles.fieldGroup}>
                <RNTextInput
                  style={styles.fieldInput}
                  placeholder="What did you spend on?"
                  placeholderTextColor={theme.colors.textQuaternary}
                  value={description}
                  onChangeText={handleDescriptionChange}
                  selectionColor={theme.colors.primary}
                  returnKeyType="next"
                />
                <View style={styles.fieldDivider} />
                <RNTextInput
                  style={styles.fieldInput}
                  placeholder="Merchant name (optional)"
                  placeholderTextColor={theme.colors.textQuaternary}
                  value={merchantName}
                  onChangeText={(t) => { setMerchantName(t); setUserPickedMerchant(true); }}
                  selectionColor={theme.colors.primary}
                  returnKeyType="next"
                />
                <View style={styles.fieldDivider} />
                <RNTextInput
                  style={styles.fieldInput}
                  placeholder="Date — MM/DD/YYYY"
                  placeholderTextColor={theme.colors.textQuaternary}
                  value={date}
                  onChangeText={setDate}
                  selectionColor={theme.colors.primary}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {/* AI Categorizing hint */}
              {categorizing && (
                <View style={styles.aiRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.aiText}>AI is detecting category…</Text>
                </View>
              )}

              {/* Category chips */}
              <Text style={styles.sectionLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {MAIN_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, mainCategory === cat && styles.chipOn]}
                    onPress={() => { setMainCategory(cat); setSubcategory(CATEGORY_GROUPS[cat]?.[0] || ''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipLabel, mainCategory === cat && styles.chipLabelOn]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>SUBCATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {currentSubs.map((sub) => (
                  <TouchableOpacity
                    key={sub}
                    style={[styles.chip, subcategory === sub && styles.chipOn]}
                    onPress={() => setSubcategory(sub)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipLabel, subcategory === sub && styles.chipLabelOn]}>{sub}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Save Button */}
              <View style={styles.saveBtn}>
                <CustomButton
                  title="Save Expense"
                  onPress={handleSubmit}
                  loading={loading}
                />
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </AddExpenseContext.Provider>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',  // Sheet anchors to bottom
  },

  // Sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 24,
  },

  dragPillWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  dragPill: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.borderLight,
  },

  // iOS sheet header
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  cancelText: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: theme.colors.primary,
  },
  sheetTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: theme.colors.text,
  },

  body: {
    paddingBottom: 24,
  },

  // Giant amount input
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  dollarSign: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 36,
    color: theme.colors.textTertiary,
    marginRight: 4,
    marginTop: 6,
  },
  amountField: {
    fontFamily: 'Inter-Black',
    fontSize: 52,
    color: theme.colors.text,
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'left',
  },

  // Settings-style inset grouped form
  fieldGroup: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  fieldInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: theme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: theme.colors.surface,
    minHeight: 52,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 16,
  },

  // AI hint
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: theme.colors.primarySurface,
    padding: 12,
    borderRadius: 10,
  },
  aiText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: theme.colors.primary,
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 4,
  },

  // Chips
  chips: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginRight: 0,
  },
  chipOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  chipLabelOn: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },

  saveBtn: {
    marginHorizontal: 20,
    marginTop: 12,
  },
});

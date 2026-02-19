import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, TouchableOpacity, Image, Platform,
  KeyboardAvoidingView, TextInput as RNTextInput, Modal,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import {
  addExpense,
  uploadReceipt,
  categorizeExpense,
  addExpenseWithItems,
} from '../api/expenses';
import { CATEGORY_GROUPS, MAIN_CATEGORIES, findMainCategory } from '../constants/categories';
import { theme } from '../theme';
import Card from '../components/Card';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { showToast } from '../components/Toast';

function todayMMDDYYYY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

interface DraftItem {
  line_no: number;
  item_name: string;
  line_total: number;
  category_name: string;
}

interface ReceiptDraft {
  header: Record<string, any>;
  items: DraftItem[];
  warnings: string[];
  fingerprint: string;
}

// ─── Dropdown picker component ───────────────────────────────
interface DropdownPickerProps {
  label: string;
  icon: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
}

function DropdownPicker({ label, icon, value, options, onSelect, placeholder }: DropdownPickerProps) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Text style={dropdownStyles.label}>{icon}  {label}</Text>
      <TouchableOpacity
        style={dropdownStyles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[dropdownStyles.triggerText, !value && dropdownStyles.placeholder]}>
          {value || placeholder || 'Select...'}
        </Text>
        <Text style={dropdownStyles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent>
        <TouchableOpacity
          style={dropdownStyles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={dropdownStyles.sheet}>
            <View style={dropdownStyles.handle} />
            <Text style={dropdownStyles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[dropdownStyles.option, value === item && dropdownStyles.optionActive]}
                  onPress={() => { onSelect(item); setVisible(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[dropdownStyles.optionText, value === item && dropdownStyles.optionTextActive]}>
                    {item}
                  </Text>
                  {value === item && <Text style={dropdownStyles.check}>✓</Text>}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 350 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────
export default function AddExpenseScreen() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [mainCategory, setMainCategory] = useState(MAIN_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
  const [date, setDate] = useState(todayMMDDYYYY());
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Receipt draft (line items)
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [showItems, setShowItems] = useState(false);

  const { accessToken, userEmail } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Handle main category change — auto-select first subcategory
  const handleMainCategoryChange = (mc: string) => {
    setMainCategory(mc);
    const subs = CATEGORY_GROUPS[mc] || [];
    setSubcategory(subs[0] || '');
    if (draft) {
      setDraft({
        ...draft,
        header: { ...draft.header, main_category_name: mc, category_name: subs[0] || '' },
      });
    }
  };

  const handleSubcategoryChange = (sub: string) => {
    setSubcategory(sub);
    if (draft) {
      setDraft({ ...draft, header: { ...draft.header, category_name: sub } });
    }
  };

  // Debounced auto-categorization
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
            if (CATEGORY_GROUPS[mc].includes(sub)) {
              setSubcategory(sub);
            } else {
              setSubcategory(CATEGORY_GROUPS[mc][0]);
            }
          }
        } catch { /* silent */ } finally { setCategorizing(false); }
      }, 600);
    }
  }, []);

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ message: 'Permission to access photos is required', type: 'warning' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0].uri);
      await parseReceipt(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ message: 'Permission to access camera is required', type: 'warning' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0].uri);
      await parseReceipt(result.assets[0].uri);
    }
  };

  const parseReceipt = async (uri: string) => {
    if (!accessToken) return;
    setParsing(true);
    try {
      const data = await uploadReceipt(uri, accessToken);
      const header = data.header || {};
      const items: DraftItem[] = (data.items || []).map((it: any, idx: number) => ({
        line_no: it.line_no || idx + 1,
        item_name: it.item_name || it.normalized_name || '',
        line_total: it.line_total || 0,
        category_name: it.category_name || '',
      }));

      let desc = header.description || '';
      if (!desc) {
        const merchant = header.merchant_name || header.merchant || '';
        const sub = header.category_name || '';
        if (sub === 'Dining out' && header.purchased_at) {
          const hour = new Date(header.purchased_at).getHours();
          const meal = hour >= 17 ? 'Dinner' : hour >= 11 ? 'Lunch' : 'Breakfast';
          desc = `${meal} at ${merchant || 'restaurant'}`;
        } else {
          desc = merchant || items.map(i => i.item_name).filter(Boolean).join(', ');
        }
      }

      if (header.amount) setAmount(String(header.amount));
      if (desc) setDescription(desc);

      // Set category from receipt response
      const mc = header.main_category_name || findMainCategory(header.category_name || '');
      const sub = header.category_name || CATEGORY_GROUPS[mc]?.[0] || '';
      setMainCategory(mc);
      if (CATEGORY_GROUPS[mc]?.includes(sub)) {
        setSubcategory(sub);
      } else {
        setSubcategory(CATEGORY_GROUPS[mc]?.[0] || '');
      }

      if (header.purchased_at) {
        try {
          const d = new Date(header.purchased_at);
          if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            setDate(`${mm}/${dd}/${d.getFullYear()}`);
          }
        } catch { /* keep current date */ }
      }

      const receiptDraft: ReceiptDraft = {
        header: { ...header, description: desc, main_category_name: mc, category_name: sub },
        items,
        warnings: data.warnings || [],
        fingerprint: data.fingerprint || '',
      };

      setDraft(receiptDraft);
      if (items.length > 0) setShowItems(true);
      showToast({ message: `Receipt parsed! ${items.length} items found`, type: 'success' });
    } catch (error) {
      showToast({ message: 'Could not parse receipt. Enter details manually.', type: 'error' });
    } finally {
      setParsing(false);
    }
  };

  const getReconcileDelta = () => {
    if (!draft) return 0;
    const subtotal = draft.items.reduce((s, it) => s + (it.line_total || 0), 0);
    const { tax = 0, tip = 0, discount = 0 } = draft.header;
    const total = parseFloat(amount) || 0;
    return subtotal + tax + tip - discount - total;
  };

  const reconcileOk = () => Math.abs(getReconcileDelta()) <= 0.02;

  const updateItem = (idx: number, field: keyof DraftItem, value: string | number) => {
    if (!draft) return;
    const items = [...draft.items];
    (items[idx] as any)[field] = value;
    setDraft({ ...draft, items });
  };

  const deleteItem = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
  };

  const addItem = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: [...draft.items, { line_no: draft.items.length + 1, item_name: '', line_total: 0, category_name: '' }],
    });
  };

  const handleSubmit = async () => {
    if (!description || !amount || !subcategory) {
      showToast({ message: 'Please fill in required fields', type: 'warning' });
      return;
    }
    if (!accessToken || !userEmail) return;

    if (draft && draft.items.length > 0 && !reconcileOk()) {
      showToast({ message: `Totals mismatch by $${getReconcileDelta().toFixed(2)}. Adjust items or total.`, type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      if (draft && draft.items.length > 0) {
        const payload = {
          user_email: userEmail,
          header: {
            ...draft.header,
            amount: parseFloat(amount),
            description,
            category_name: subcategory,
            main_category_name: mainCategory,
            purchased_at: date,
            fingerprint: draft.fingerprint,
          },
          items: draft.items.map((i) => ({ ...i })),
        };
        await addExpenseWithItems(payload);
        showToast({ message: 'Expense with items saved! 🎉', type: 'success' });
      } else {
        await addExpense(
          {
            description,
            cost: parseFloat(amount),
            category: subcategory,
            sub_category: subcategory,
            date,
            user_id: userEmail,
          },
          accessToken,
        );
        showToast({ message: 'Expense added successfully! 🎉', type: 'success' });
      }

      setDescription('');
      setAmount('');
      setMainCategory(MAIN_CATEGORIES[0]);
      setSubcategory(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
      setImage(null);
      setDraft(null);
      setShowItems(false);
      setDate(todayMMDDYYYY());
      navigation.goBack();
    } catch (error: any) {
      showToast({ message: error.message || 'Failed to save expense', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const TAB_BAR_HEIGHT = 72;
  const currentSubs = CATEGORY_GROUPS[mainCategory] || [];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_HEIGHT + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={theme.typography.h2}>Add Expense</Text>
        <Text style={styles.subtitle}>Track your spending</Text>

        {/* Receipt Upload */}
        <Card style={styles.receiptCard}>
          <Text style={styles.cardLabel}>RECEIPT (OPTIONAL)</Text>
          {image ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: image }} style={styles.previewImage} />
              {parsing && (
                <View style={styles.parsingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.parsingText}>Parsing receipt...</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => { setImage(null); setDraft(null); setShowItems(false); }}
                style={styles.removeImageBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.removeX}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadRow}>
              <TouchableOpacity
                style={[styles.uploadBtn, parsing && styles.uploadBtnDisabled]}
                onPress={handlePickImage}
                activeOpacity={0.7}
                disabled={parsing}
              >
                {parsing ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={styles.uploadEmoji}>🖼️</Text>
                )}
                <Text style={styles.uploadLabel}>{parsing ? 'Parsing...' : 'Gallery'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.uploadBtn, parsing && styles.uploadBtnDisabled]}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
                disabled={parsing}
              >
                <Text style={styles.uploadEmoji}>📷</Text>
                <Text style={styles.uploadLabel}>Camera</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Parsed Line Items */}
        {draft && draft.items.length > 0 && (
          <Card style={styles.itemsCard}>
            <TouchableOpacity
              style={styles.itemsHeader}
              onPress={() => setShowItems(!showItems)}
              activeOpacity={0.7}
            >
              <View style={styles.itemsHeaderLeft}>
                <Text style={styles.itemsTitle}>🧾 Line Items</Text>
                <View style={styles.itemsBadge}>
                  <Text style={styles.itemsBadgeText}>{draft.items.length}</Text>
                </View>
              </View>
              <Text style={styles.itemsChevron}>{showItems ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showItems && (
              <View style={styles.itemsList}>
                {draft.items.map((item, idx) => (
                  <View key={`item-${idx}`} style={styles.lineItem}>
                    <View style={styles.lineItemRow}>
                      <View style={styles.lineItemNameCol}>
                        <Text style={styles.lineItemLabel}>Item</Text>
                        <RNTextInput
                          style={styles.lineItemInput}
                          value={item.item_name}
                          onChangeText={(v) => updateItem(idx, 'item_name', v)}
                          placeholder="Name"
                          placeholderTextColor={theme.colors.textTertiary}
                        />
                      </View>
                      <View style={styles.lineItemTotalCol}>
                        <Text style={styles.lineItemLabel}>Total</Text>
                        <RNTextInput
                          style={styles.lineItemInput}
                          value={String(item.line_total)}
                          onChangeText={(v) => updateItem(idx, 'line_total', parseFloat(v) || 0)}
                          keyboardType="numeric"
                          placeholder="0.00"
                          placeholderTextColor={theme.colors.textTertiary}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteItem(idx)}
                        style={styles.lineItemDeleteBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.lineItemDeleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
                  <Text style={styles.addItemText}>＋ Add Item</Text>
                </TouchableOpacity>

                <View style={[styles.reconcileBar, reconcileOk() ? styles.reconcileOk : styles.reconcileError]}>
                  <Text style={[styles.reconcileText, reconcileOk() ? styles.reconcileTextOk : styles.reconcileTextError]}>
                    {reconcileOk()
                      ? '✅ Totals match'
                      : `⚠️ Mismatch: $${getReconcileDelta().toFixed(2)}`}
                  </Text>
                  <Text style={styles.reconcileSubtext}>
                    Subtotal: ${draft.items.reduce((s, i) => s + i.line_total, 0).toFixed(2)}
                    {draft.header.tax ? ` + Tax: $${draft.header.tax}` : ''}
                    {draft.header.tip ? ` + Tip: $${draft.header.tip}` : ''}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Expense Form */}
        <Card>
          <CustomInput
            label="Amount"
            icon="💰"
            placeholder="0.00"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <CustomInput
            label="Description"
            icon="📝"
            placeholder="What was this expense for?"
            value={description}
            onChangeText={handleDescriptionChange}
          />

          {categorizing && (
            <Text style={styles.categorizingHint}>✨ Auto-detecting category...</Text>
          )}

          {/* Category dropdown */}
          <DropdownPicker
            label="Main Category"
            icon="📁"
            value={mainCategory}
            options={MAIN_CATEGORIES}
            onSelect={handleMainCategoryChange}
            placeholder="Select category"
          />

          {/* Subcategory dropdown */}
          <DropdownPicker
            label="Subcategory"
            icon="📂"
            value={subcategory}
            options={currentSubs}
            onSelect={handleSubcategoryChange}
            placeholder="Select subcategory"
          />

          <CustomInput
            label="Date"
            icon="📅"
            placeholder="MM/DD/YYYY"
            value={date}
            onChangeText={setDate}
          />

          <CustomButton
            title={draft && draft.items.length > 0 ? 'Save with Items' : 'Save Expense'}
            onPress={handleSubmit}
            loading={loading}
            icon="💾"
            style={{ marginTop: 8 }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const dropdownStyles = StyleSheet.create({
  label: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginLeft: 4,
  },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: 14,
  },
  triggerText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  placeholder: { color: theme.colors.textTertiary },
  chevron: { fontSize: 14, color: theme.colors.textTertiary },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4,
    backgroundColor: theme.colors.background,
  },
  optionActive: { backgroundColor: theme.colors.primarySurface, borderWidth: 1, borderColor: theme.colors.primary },
  optionText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  optionTextActive: { color: theme.colors.primary, fontWeight: '700' },
  check: { fontSize: 18, color: theme.colors.primary, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  subtitle: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 20 },
  receiptCard: { alignItems: 'center', paddingVertical: 20 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 1, marginBottom: 14 },
  uploadRow: { flexDirection: 'row', gap: 16 },
  uploadBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: 28,
    borderRadius: 16, backgroundColor: theme.colors.primarySurface,
    borderWidth: 1.5, borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed', minWidth: 100,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadEmoji: { fontSize: 28, marginBottom: 6 },
  uploadLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  imagePreview: { position: 'relative', width: '100%', height: 200, borderRadius: 16, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  parsingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  parsingText: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 10 },
  removeImageBtn: {
    position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
  },
  removeX: { color: '#fff', fontWeight: '800', fontSize: 16 },
  itemsCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  itemsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.colors.primarySurface,
  },
  itemsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemsTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  itemsBadge: { backgroundColor: theme.colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  itemsBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  itemsChevron: { fontSize: 12, color: theme.colors.textSecondary },
  itemsList: { padding: 12 },
  lineItem: {
    backgroundColor: theme.colors.background, borderRadius: 12, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  lineItemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  lineItemNameCol: { flex: 2 },
  lineItemTotalCol: { flex: 1 },
  lineItemLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.textTertiary, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  lineItemInput: {
    fontSize: 14, color: theme.colors.text, fontWeight: '500', padding: 8, borderRadius: 8,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, minHeight: 36,
  },
  lineItemDeleteBtn: { width: 32, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEE2E2' },
  lineItemDeleteText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  addItemBtn: {
    paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1,
    borderColor: theme.colors.primary, borderStyle: 'dashed', marginTop: 4, marginBottom: 8,
  },
  addItemText: { color: theme.colors.primary, fontSize: 14, fontWeight: '600' },
  reconcileBar: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  reconcileOk: { backgroundColor: '#ECFDF5' },
  reconcileError: { backgroundColor: '#FEF2F2' },
  reconcileText: { fontSize: 14, fontWeight: '600' },
  reconcileTextOk: { color: '#059669' },
  reconcileTextError: { color: '#DC2626' },
  reconcileSubtext: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  categorizingHint: { fontSize: 12, color: theme.colors.primary, fontWeight: '500', marginBottom: 8, marginLeft: 4 },
});

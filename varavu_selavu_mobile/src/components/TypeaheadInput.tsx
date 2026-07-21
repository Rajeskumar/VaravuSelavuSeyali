/**
 * TypeaheadInput.tsx — free-typed text field with typo-tolerant suggestions
 * (TS-ENT-1xx, spec §8/§11.1). No existing dropdown-while-typing precedent in
 * this codebase (SimpleSelect.tsx is a tap-to-open full picker, not this) so
 * this is a bespoke component per the entity-resolution frontend plan.
 *
 * Suggestions render in a RN `Modal` positioned to the input's measured
 * on-screen position (`measureInWindow`), not an inline `View` — a Modal
 * renders in its own native layer, so it can never be clipped by a parent's
 * `overflow`/`maxHeight` the way an inline dropdown would be. This matters
 * specifically for ScannedItemsCard's item rows, which live inside a
 * height-constrained nested ScrollView.
 *
 * The text stays freeSolo: nothing here blocks typing or requires picking a
 * suggestion — selecting one is just a shortcut that fills the field.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView,
  ActivityIndicator, StyleSheet, TextStyle, StyleProp, ViewStyle,
} from 'react-native';
import { AppTheme } from '../theme';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EntitySuggestion } from '../api/entityResolution';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;

interface TypeaheadInputProps {
  theme: AppTheme;
  value: string;
  onChangeValue: (v: string) => void;
  fetchSuggestions: (query: string) => Promise<EntitySuggestion[]>;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  onBlur?: () => void;
  autoFocus?: boolean;
}

const TypeaheadInput: React.FC<TypeaheadInputProps> = ({
  theme,
  value,
  onChangeValue,
  fetchSuggestions,
  placeholder,
  inputStyle,
  containerStyle,
  onBlur,
  autoFocus,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  // Set on selection, cleared on the next real keystroke — without this, picking
  // a suggestion re-triggers the debounced effect for the new value (the
  // TextInput doesn't reliably blur on RN Web when a Modal-hosted option is
  // tapped), so the dropdown immediately reopens with fresh matches for
  // whatever was just selected instead of closing.
  const [dismissed, setDismissed] = useState(false);
  const [options, setOptions] = useState<EntitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const debounced = useDebouncedValue(value, DEBOUNCE_MS);
  const latestQueryRef = useRef('');

  useEffect(() => {
    const query = debounced.trim();
    if (!focused || dismissed || query.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      return;
    }
    latestQueryRef.current = query;
    let cancelled = false;
    setLoading(true);
    fetchSuggestions(query)
      .then((results) => {
        if (cancelled || latestQueryRef.current !== query) return;
        setOptions(results);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, focused, dismissed, fetchSuggestions]);

  const measure = () => {
    // requestAnimationFrame: gives a scroll-into-view-on-focus / keyboard
    // animation a beat to settle before we anchor the dropdown to it.
    requestAnimationFrame(() => {
      inputRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
      });
    });
  };

  const handleFocus = () => {
    setFocused(true);
    measure();
  };

  const handleBlur = () => {
    // Don't close synchronously — a tap on a suggestion inside the Modal
    // blurs the TextInput first on some platforms, and closing immediately
    // would unmount the Modal before that tap's onPress has a chance to fire.
    setTimeout(() => setFocused(false), 150);
    onBlur?.();
  };

  const handleChangeText = (t: string) => {
    setDismissed(false);
    onChangeValue(t);
  };

  const handleSelect = (opt: EntitySuggestion) => {
    setDismissed(true);
    setOptions([]);
    onChangeValue(opt.display_name);
    setFocused(false);
  };

  const dismissDropdown = () => {
    setDismissed(true);
    setFocused(false);
  };

  const showDropdown = focused && !dismissed && !!anchor && (loading || options.length > 0);

  return (
    <View style={containerStyle} onLayout={focused ? measure : undefined}>
      <TextInput
        ref={inputRef}
        style={inputStyle}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textQuaternary}
        autoFocus={autoFocus}
      />
      {showDropdown && anchor && (
        <Modal visible transparent animationType="none" onRequestClose={dismissDropdown}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissDropdown}>
            <View
              style={[
                styles.dropdown,
                {
                  top: anchor.y + anchor.height + 4,
                  left: anchor.x,
                  width: anchor.width,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.borderLight,
                },
                theme.shadows.md,
              ]}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.optionsScroll}>
                  {options.map((opt) => (
                    <TouchableOpacity key={opt.id} style={styles.option} onPress={() => handleSelect(opt)} activeOpacity={0.7}>
                      <Text style={[styles.optionText, { color: theme.colors.text }]} numberOfLines={1}>
                        {opt.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  optionsScroll: { maxHeight: 220 },
  loadingRow: { paddingVertical: 12, alignItems: 'center' },
  option: { paddingHorizontal: 12, paddingVertical: 10 },
  optionText: { fontFamily: 'InstrumentSans-Regular', fontSize: 13.5 },
});

export default TypeaheadInput;

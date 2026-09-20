import React, { useMemo } from 'react';
import { View, Modal, Pressable, StyleSheet, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fill almost the whole screen (itemised split) instead of hugging its content. */
  tall?: boolean;
}

/**
 * V2 bottom sheet — dimmed backdrop, `surfaceElevated` panel with 26px top radius, 40×4 grabber
 * and a 22px gutter. Sheets are the only surfaces that keep a real shadow (see theme.ts elevation
 * policy). Capture, split, items, detail and settle all render inside this.
 */
export default function Sheet({ visible, onClose, children, tall }: SheetProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.panel,
              { paddingBottom: Math.max(insets.bottom, 16) + 4, maxHeight: height * (tall ? 0.94 : 0.92) },
              tall && { height: height * 0.94 },
            ]}
          >
            <View style={styles.grabber} />
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
  kav: { justifyContent: 'flex-end' },
  panel: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 14,
    ...theme.shadows.lg,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center' },
});

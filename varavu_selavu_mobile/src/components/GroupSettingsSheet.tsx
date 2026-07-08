import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Modal, Pressable, KeyboardAvoidingView, Platform, Animated, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GroupDetail,
  updateGroup,
  archiveGroup,
  unarchiveGroup,
  restoreGroup,
  deleteGroup,
  getNotificationPreferences,
  updateNotificationPreferences,
  fetchGroupExportCsv,
  ApiError,
} from '../api/groups';
import { useQueryClient } from '@tanstack/react-query';
import CustomButton from './CustomButton';
import SplitEditor from './SplitEditor';
import { SplitEditorValue } from './SplitEditor';
import { showToast } from './Toast';
import { useAppTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface GroupSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  group: GroupDetail;
}

export default function GroupSettingsSheet({ visible, onClose, group }: GroupSettingsSheetProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [simplifyDebts, setSimplifyDebts] = useState(group.simplify_debts);

  const defaultSplitVal: SplitEditorValue = group.default_split || { type: 'equal', entries: [] };
  const [splitValue, setSplitValue] = useState<SplitEditorValue>(defaultSplitVal);
  const [saving, setSaving] = useState(false);

  // TS-GRP-125: notification preferences — saved immediately on toggle,
  // independent of the group-settings "Save" button below.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (!visible) return;
    getNotificationPreferences(group.group_id)
      .then((p) => setMuted(p.muted))
      .catch(() => {});
  }, [visible, group.group_id]);

  const handleToggleMuted = async (value: boolean) => {
    setMuted(value);
    try {
      await updateNotificationPreferences(group.group_id, { muted: value });
    } catch (e) {
      setMuted(!value);
      showToast({ message: 'Failed to update notification preference', type: 'error' });
    }
  };

  const handleExport = async () => {
    try {
      const csv = await fetchGroupExportCsv(group.group_id);
      await Share.share({ message: csv, title: `${group.name} export.csv` });
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to export group', type: 'error' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGroup(group.group_id, {
        simplify_debts: simplifyDebts,
        default_split: splitValue.type === 'equal' && splitValue.entries.length === 0 ? null : splitValue,
      });
      queryClient.invalidateQueries({ queryKey: ['group-detail', group.group_id] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', group.group_id] });
      showToast({ message: 'Settings saved', type: 'success' });
      onClose();
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to save settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.pill} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Group Settings</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.textCol}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Simplify Debts</Text>
                <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>
                  Minimize the total number of transactions needed to settle all debts.
                </Text>
              </View>
              <Switch
                value={simplifyDebts}
                onValueChange={setSimplifyDebts}
                trackColor={{ false: '#d1d1d6', true: theme.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.textCol}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Notifications</Text>
                <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>
                  Mute push notifications for this group. Only affects you.
                </Text>
              </View>
              <Switch
                value={muted}
                onValueChange={handleToggleMuted}
                trackColor={{ false: '#d1d1d6', true: theme.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Export</Text>
            <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>
              Share every expense and settlement in this group as a CSV file.
            </Text>
            <CustomButton
              title="Export CSV"
              onPress={handleExport}
              style={[styles.saveBtn, { backgroundColor: theme.colors.surfaceSecondary, marginTop: 12 }]}
              textStyle={{ color: theme.colors.text }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Default Split</Text>
            <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>
              Set a default split rule for all new expenses.
            </Text>
            <View style={styles.splitEditorContainer}>
              <SplitEditor
                totalAmount={100}
                members={group.members}
                value={splitValue}
                onChange={setSplitValue}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>Danger Zone</Text>
            
            {group.status === 'active' && (
              <CustomButton
                title="Archive Group"
                onPress={async () => {
                  setSaving(true);
                  try {
                    await archiveGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group-detail', group.group_id] });
                    showToast({ message: 'Group archived', type: 'success' });
                    onClose();
                  } catch (e) {
                    showToast({ message: e instanceof ApiError ? e.message : 'Failed to archive', type: 'error' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: theme.colors.warning, marginBottom: 12 }]}
              />
            )}
            
            {group.status === 'archived' && (
              <CustomButton
                title="Unarchive Group"
                onPress={async () => {
                  setSaving(true);
                  try {
                    await unarchiveGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group-detail', group.group_id] });
                    showToast({ message: 'Group unarchived', type: 'success' });
                    onClose();
                  } catch (e) {
                    showToast({ message: e instanceof ApiError ? e.message : 'Failed to unarchive', type: 'error' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: theme.colors.primary, marginBottom: 12 }]}
              />
            )}

            {group.status === 'deleted' && (
              <CustomButton
                title="Restore Group"
                onPress={async () => {
                  setSaving(true);
                  try {
                    await restoreGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group-detail', group.group_id] });
                    showToast({ message: 'Group restored', type: 'success' });
                    onClose();
                  } catch (e) {
                    showToast({ message: e instanceof ApiError ? e.message : 'Failed to restore', type: 'error' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: theme.colors.primary, marginBottom: 12 }]}
              />
            )}

            {group.status !== 'deleted' && (
              <CustomButton
                title="Delete Group"
                onPress={async () => {
                  setSaving(true);
                  try {
                    await deleteGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group-detail', group.group_id] });
                    showToast({ message: 'Group deleted', type: 'success' });
                    onClose();
                  } catch (e) {
                    showToast({ message: e instanceof ApiError ? e.message : 'Failed to delete', type: 'error' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: theme.colors.error }]}
              />
            )}
          </View>

          <CustomButton
            title={saving ? 'Saving...' : 'Save Settings'}
            onPress={handleSave}
            disabled={saving}
            style={styles.saveBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
  },
  closeBtn: {
    padding: 4,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
    paddingRight: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  divider: {
    height: 1,
    marginBottom: 20,
  },
  splitEditorContainer: {
    marginTop: 16,
  },
  saveBtn: {
    marginTop: 'auto',
    marginBottom: 8,
  },
});

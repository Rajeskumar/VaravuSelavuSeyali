import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, KeyboardAvoidingView, Platform, Animated,
    ActivityIndicator, Keyboard, Modal, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage, ChatPayload } from '../api/chat';
import { apiFetch } from '../api/apiFetch';
import { theme } from '../theme';

type Period = 'last_month' | 'this_year' | 'all_time';

function getDateRange(period: Period): { start_date?: string; end_date?: string; year?: number } {
    const now = new Date();
    switch (period) {
        case 'last_month': {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            return {
                start_date: `${(lastMonth.getMonth() + 1).toString().padStart(2, '0')}/01/${lastMonth.getFullYear()}`,
                end_date: `${(lastDay.getMonth() + 1).toString().padStart(2, '0')}/${lastDay.getDate().toString().padStart(2, '0')}/${lastDay.getFullYear()}`,
            };
        }
        case 'this_year':
            return { year: now.getFullYear() };
        case 'all_time':
            return {};
    }
}

const PERIODS: { key: Period; label: string }[] = [
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year', label: 'This Year' },
    { key: 'all_time', label: 'All Time' },
];

interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function AIAnalystScreen() {
    const { accessToken, userEmail } = useAuth();
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [period, setPeriod] = useState<Period>('this_year');
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    // Model selector state
    const [models, setModels] = useState<string[]>([]);
    const [provider, setProvider] = useState<string>('');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [modelPickerVisible, setModelPickerVisible] = useState(false);

    // Typing indicator animation
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    // Fetch available models on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/api/v1/models');
                if (res.ok) {
                    const data = await res.json();
                    setModels(data.models || []);
                    setProvider(data.provider || '');
                    if (data.models?.length && !selectedModel) {
                        setSelectedModel(data.models[0]);
                    }
                }
            } catch {
                // Non-fatal
            }
        })();
    }, []);

    // Track keyboard height precisely
    useEffect(() => {
        const showSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => setKeyboardHeight(e.endCoordinates.height),
        );
        const hideSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setKeyboardHeight(0),
        );
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    useEffect(() => {
        if (loading) {
            const dotAnims = [dot1, dot2, dot3];
            const animations = dotAnims.map((d, i) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(i * 200),
                        Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
                        Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
                    ]),
                ),
            );
            animations.forEach((a) => a.start());
            return () => animations.forEach((a) => a.stop());
        }
    }, [loading]);

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || loading) return;

        const userMsg: DisplayMessage = { id: Date.now().toString(), role: 'user', content: text };
        setMessages((prev) => [...prev, userMsg]);
        setInputText('');
        setLoading(true);

        try {
            const dateRange = getDateRange(period);
            const payload: ChatPayload = {
                user_id: userEmail || '',
                query: text,
                ...dateRange,
                model: selectedModel || undefined,
            };

            const response = await sendChatMessage(accessToken || '', payload);
            const assistantMsg: DisplayMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (error: any) {
            const errorMsg: DisplayMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `❌ Error: ${error.message || 'Something went wrong'}`,
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const renderMessage = ({ item }: { item: DisplayMessage }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
                {!isUser && <Text style={styles.avatar}>🤖</Text>}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
                        {item.content}
                    </Text>
                </View>
                {isUser && <Text style={styles.avatar}>👤</Text>}
            </View>
        );
    };

    const renderTypingIndicator = () => {
        if (!loading) return null;
        return (
            <View style={[styles.messageRow, styles.messageRowAssistant]}>
                <Text style={styles.avatar}>🤖</Text>
                <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
                    {[dot1, dot2, dot3].map((d, i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.typingDot,
                                { transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] },
                            ]}
                        />
                    ))}
                </View>
            </View>
        );
    };

    // When keyboard is closed, we need space for the absolute tab bar (72px)
    // When keyboard is open, the tab bar hides, so no extra spacing needed
    const isKeyboardUp = keyboardHeight > 0;
    const TAB_BAR_HEIGHT = 72;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header bar: Period chips + Model selector — inside safe area */}
            <View style={styles.headerBar}>
                <View style={styles.periodRow}>
                    {PERIODS.map(({ key, label }) => (
                        <TouchableOpacity
                            key={key}
                            style={[styles.periodChip, period === key && styles.periodChipActive]}
                            onPress={() => setPeriod(key)}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={[styles.periodChipText, period === key && styles.periodChipTextActive]}
                                numberOfLines={1}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {models.length > 0 && (
                    <TouchableOpacity
                        style={styles.modelBtn}
                        onPress={() => setModelPickerVisible(true)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.modelBtnIcon}>🧠</Text>
                        <Text style={styles.modelBtnText} numberOfLines={1}>
                            {selectedModel || 'Select Model'}
                        </Text>
                        <Text style={styles.modelChevron}>▾</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Chat messages — takes all available space */}
            <KeyboardAvoidingView
                style={styles.chatArea}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={insets.top + 100}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={[
                        styles.chatContent,
                        { paddingBottom: 8 },
                    ]}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🤖</Text>
                            <Text style={styles.emptyTitle}>AI Financial Analyst</Text>
                            <Text style={styles.emptySubtitle}>
                                Ask me anything about your expenses
                            </Text>
                            <View style={styles.emptyPeriodBadge}>
                                <Text style={styles.emptyPeriodText}>
                                    📅 {PERIODS.find(p => p.key === period)?.label}
                                </Text>
                            </View>
                            <Text style={styles.emptyHint}>
                                e.g. "What were my top spending categories?"
                            </Text>
                        </View>
                    }
                    ListFooterComponent={renderTypingIndicator}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                />

                {/* Input area — flush against keyboard or tab bar */}
                <View
                    style={[
                        styles.inputArea,
                        { paddingBottom: isKeyboardUp ? 4 : TAB_BAR_HEIGHT + 4 },
                    ]}
                >
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            placeholder="Ask about your finances..."
                            placeholderTextColor={theme.colors.textTertiary}
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={handleSend}
                            multiline
                            maxLength={500}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || loading}
                            activeOpacity={0.7}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.sendBtnText}>↑</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* Model Picker Modal */}
            <Modal visible={modelPickerVisible} animationType="slide" transparent>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setModelPickerVisible(false)}
                >
                    <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>
                            Select Model {provider ? `(${provider})` : ''}
                        </Text>
                        {models.map((m) => (
                            <TouchableOpacity
                                key={m}
                                style={[styles.modelOption, selectedModel === m && styles.modelOptionActive]}
                                onPress={() => { setSelectedModel(m); setModelPickerVisible(false); }}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.modelOptionText, selectedModel === m && styles.modelOptionTextActive]}>
                                    {m}
                                </Text>
                                {selectedModel === m && <Text style={styles.modelCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    // Header: period chips + model selector
    headerBar: {
        paddingHorizontal: 12,
        paddingTop: 4,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    periodRow: {
        flexDirection: 'row',
        gap: 6,
    },
    periodChip: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    periodChipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    periodChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    periodChipTextActive: { color: '#fff' },
    modelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modelBtnIcon: { fontSize: 14, marginRight: 6 },
    modelBtnText: { flex: 1, fontSize: 12, fontWeight: '500', color: theme.colors.text },
    modelChevron: { fontSize: 10, color: theme.colors.textTertiary, marginLeft: 4 },
    // Chat area
    chatArea: { flex: 1 },
    chatContent: { paddingVertical: 12, paddingHorizontal: 14 },
    // Messages
    messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 6 },
    messageRowUser: { justifyContent: 'flex-end', paddingLeft: 36 },
    messageRowAssistant: { justifyContent: 'flex-start', paddingRight: 36 },
    avatar: { fontSize: 20, marginBottom: 2 },
    bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
    userBubble: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
    assistantBubble: { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, ...theme.shadows.sm },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    userText: { color: '#fff' },
    assistantText: { color: theme.colors.text },
    typingBubble: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
    typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.textTertiary },
    // Input area
    inputArea: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
        paddingHorizontal: 10,
        paddingTop: 6,
    },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        minHeight: 42,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    sendBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: { backgroundColor: theme.colors.textTertiary },
    sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 36 },
    emptyPeriodBadge: {
        marginTop: 10,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.primarySurface,
    },
    emptyPeriodText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
    emptyHint: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 14, fontStyle: 'italic' },
    // Model picker modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
    },
    modalHandle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border,
        alignSelf: 'center', marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
    modelOption: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6,
        backgroundColor: theme.colors.background,
    },
    modelOptionActive: { backgroundColor: theme.colors.primarySurface, borderWidth: 1, borderColor: theme.colors.primary },
    modelOptionText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
    modelOptionTextActive: { color: theme.colors.primary, fontWeight: '700' },
    modelCheck: { fontSize: 18, color: theme.colors.primary, fontWeight: '700' },
});

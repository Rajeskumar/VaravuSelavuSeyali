import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, KeyboardAvoidingView, Platform, Animated,
    ActivityIndicator, Keyboard, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage, ChatPayload, ChatMessage } from '../api/chat';
import { apiFetch } from '../api/apiFetch';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

const SUGGESTED_PROMPTS = [
    "What were my top spending categories?",
    "How much did I spend at Amazon?",
    "Has the price of milk gone up?",
    "Where did I buy eggs cheapest?"
];

interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface ModelOption {
    provider: string;
    id: string;
    name: string;
}

type PeriodMode = 'default' | 'this_month' | 'this_year' | 'all_time';

const PERIOD_LABELS: Record<PeriodMode, string> = {
    default: 'Last 3 months',
    this_month: 'This month',
    this_year: 'This year',
    all_time: 'All time',
};

/** Resolves the UI period mode into the year/month/start_date/end_date fields the chat API expects. */
function resolvePeriodPayload(mode: PeriodMode) {
    const now = new Date();
    if (mode === 'this_month') return { year: now.getFullYear(), month: now.getMonth() + 1 };
    if (mode === 'this_year') return { year: now.getFullYear() };
    if (mode === 'all_time') return { start_date: '1970-01-01', end_date: now.toISOString().slice(0, 10) };
    return {}; // 'default' — let the backend apply its rolling last-3-months default
}

export default function AIAnalystScreen() {
    const { accessToken, userEmail } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    // Model selector state
    const [models, setModels] = useState<ModelOption[]>([]);
    const [provider, setProvider] = useState<string>('');
    const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
    const [modelPickerVisible, setModelPickerVisible] = useState(false);

    // Period selector state — controls what expense data the AI receives by default
    const [periodMode, setPeriodMode] = useState<PeriodMode>('default');
    const [periodPickerVisible, setPeriodPickerVisible] = useState(false);

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

    const handleSend = async (textOverride?: string) => {
        const text = textOverride || inputText.trim();
        if (!text || loading) return;

        const userMsg: DisplayMessage = { id: Date.now().toString(), role: 'user', content: text };
        
        // Compute new history immediately for payload
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputText('');
        setLoading(true);

        try {
            // Map our DisplayMessage to ChatMessage for the API
            const apiMessages: ChatMessage[] = newHistory.map(m => ({
                role: m.role,
                content: m.content
            }));
            
            const payload: ChatPayload = {
                user_id: userEmail || '',
                messages: apiMessages,
                model: selectedModel ? selectedModel.id : undefined,
                provider: selectedModel ? selectedModel.provider : undefined,
                ...resolvePeriodPayload(periodMode),
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

    // Deep-link support: screens like Item/Merchant Insights navigate here with
    // an initialQuery param (e.g. "Ask AI about this item") that should
    // auto-send once, mirroring the web app's `?q=` query param behavior.
    const autoSentQueryRef = useRef<string | null>(null);
    useEffect(() => {
        const initialQuery = route.params?.initialQuery as string | undefined;
        if (initialQuery && autoSentQueryRef.current !== initialQuery) {
            autoSentQueryRef.current = initialQuery;
            handleSend(initialQuery);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.initialQuery]);

    const renderMessage = ({ item }: { item: DisplayMessage }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
                {!isUser && (
                    <View style={styles.avatarBadge}>
                        <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
                    </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
                        {item.content}
                    </Text>
                </View>
                {isUser && (
                    <View style={[styles.avatarBadge, { backgroundColor: theme.colors.primary }]}>
                        <Ionicons name="person" size={16} color="#fff" />
                    </View>
                )}
            </View>
        );
    };

    const renderTypingIndicator = () => {
        if (!loading) return null;
        return (
            <View style={[styles.messageRow, styles.messageRowAssistant]}>
                <View style={styles.avatarBadge}>
                    <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
                </View>
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

    // When keyboard is closed, we need space for the absolute tab bar
    // The pill nav is 66px tall + 16px bottom margin + safe area
    const isKeyboardUp = keyboardHeight > 0;
    const TAB_BAR_HEIGHT = 82 + insets.bottom;

    return (
        <LinearGradient colors={theme.gradients.surface} style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header bar: Period + Model selectors — inside safe area */}
            <View style={styles.headerBar}>
                <View style={styles.headerTitleRow}>
                    <Text style={styles.headerTitle}>AI Analyst</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                        style={[styles.modelBtn, { maxWidth: 110 }]}
                        onPress={() => setPeriodPickerVisible(true)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="calendar" size={13} color={theme.colors.textSecondary} style={{ marginRight: 5 }} />
                        <Text style={styles.modelBtnText} numberOfLines={1}>
                            {PERIOD_LABELS[periodMode]}
                        </Text>
                        <Ionicons name="chevron-down" size={11} color={theme.colors.textTertiary} style={{ marginLeft: 3 }} />
                    </TouchableOpacity>
                    {models.length > 0 && (
                        <TouchableOpacity
                            style={[styles.modelBtn, { maxWidth: 110 }]}
                            onPress={() => setModelPickerVisible(true)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="hardware-chip" size={13} color={theme.colors.textSecondary} style={{ marginRight: 5 }} />
                            <Text style={styles.modelBtnText} numberOfLines={1}>
                                {selectedModel ? selectedModel.name : 'Select Model'}
                            </Text>
                            <Ionicons name="chevron-down" size={11} color={theme.colors.textTertiary} style={{ marginLeft: 3 }} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Chat messages — takes all available space */}
            <KeyboardAvoidingView
                style={styles.chatArea}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={insets.top + 50}
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
                            <View style={styles.emptyIconBadge}>
                                <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
                            </View>
                            <Text style={styles.emptyTitle}>AI Financial Analyst</Text>
                            <Text style={styles.emptySubtitle}>
                                Ask me anything about your expenses, specific items, or merchants.
                            </Text>
                            <TouchableOpacity style={styles.emptyPeriodBadge} onPress={() => setPeriodPickerVisible(true)} activeOpacity={0.7}>
                                <Ionicons name="information-circle" size={13} color={theme.colors.primary} />
                                <Text style={styles.emptyPeriodText}>
                                    Scoped to {PERIOD_LABELS[periodMode].toLowerCase()} — tap to change
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.suggestionsContainer}>
                                <Text style={styles.suggestionsTitle}>Try asking:</Text>
                                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={styles.suggestionChip}
                                        onPress={() => handleSend(prompt)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.suggestionText}>{prompt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.browseRow}>
                                <Text style={styles.browseRowText}>Prefer browsing instead of asking?</Text>
                                <View style={styles.browseLinksRow}>
                                    <TouchableOpacity onPress={() => navigation.navigate('ItemInsights')} activeOpacity={0.7}>
                                        <Text style={styles.browseLink}>Item Insights</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.browseRowText}> · </Text>
                                    <TouchableOpacity onPress={() => navigation.navigate('MerchantInsights')} activeOpacity={0.7}>
                                        <Text style={styles.browseLink}>Merchant Insights</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
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
                            onSubmitEditing={() => handleSend()}
                            multiline
                            maxLength={500}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
                            onPress={() => handleSend()}
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
                                key={m.id}
                                style={[styles.modelOption, selectedModel?.id === m.id && styles.modelOptionActive]}
                                onPress={() => { setSelectedModel(m); setModelPickerVisible(false); }}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.modelOptionText, selectedModel?.id === m.id && styles.modelOptionTextActive]}>
                                    {m.name}
                                </Text>
                                {selectedModel?.id === m.id && <Text style={styles.modelCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Period Picker Modal */}
            <Modal visible={periodPickerVisible} animationType="slide" transparent>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setPeriodPickerVisible(false)}
                >
                    <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>What period is this about?</Text>
                        {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.modelOption, periodMode === mode && styles.modelOptionActive]}
                                onPress={() => { setPeriodMode(mode); setPeriodPickerVisible(false); }}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.modelOptionText, periodMode === mode && styles.modelOptionTextActive]}>
                                    {PERIOD_LABELS[mode]}
                                </Text>
                                {periodMode === mode && <Text style={styles.modelCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </LinearGradient>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text,
    },
    modelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        maxWidth: 160,
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
    avatarBadge: {
        width: 26, height: 26, borderRadius: 13, marginBottom: 2,
        backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center',
    },
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
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyIconBadge: {
        width: 64, height: 64, borderRadius: 20, marginBottom: 12,
        backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 36 },
    emptyPeriodBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.colors.primarySurface,
        marginBottom: 20,
    },
    emptyPeriodText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
    browseRow: { marginTop: 24, alignItems: 'center' },
    browseRowText: { fontSize: 13, color: theme.colors.textSecondary },
    browseLinksRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    browseLink: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, textDecorationLine: 'underline' },
    suggestionsContainer: { width: '100%', paddingHorizontal: 20, marginTop: 10 },
    suggestionsTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 10, textAlign: 'center' },
    suggestionChip: { 
        backgroundColor: theme.colors.surface, 
        borderWidth: 1, 
        borderColor: theme.colors.border,
        borderRadius: 20, 
        paddingVertical: 10, 
        paddingHorizontal: 16, 
        marginBottom: 8,
        ...theme.shadows.sm
    },
    suggestionText: { fontSize: 14, color: theme.colors.primary, textAlign: 'center', fontWeight: '500' },
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

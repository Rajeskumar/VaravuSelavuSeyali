import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, KeyboardAvoidingView, Platform, Animated,
    ActivityIndicator, Keyboard, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { sendChatMessageFull, ChatPayload, ChatMessage } from '../api/chat';
import { scopeLine } from '../utils/chatScope';
import { apiFetch } from '../api/apiFetch';
import { AiLimitError } from '../api/aiUsage';
import { useAiUsage } from '../hooks/useAiUsage';
import AiQuotaNote from '../components/AiQuotaNote';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha, inkOnPastel } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { notifyExpenseChanged } from '../utils/expenseEvents';

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
    scope?: string;
}

interface ModelOption {
    provider: string;
    id: string;
    name: string;
}

export default function AIAnalystScreen() {
    const { accessToken, userEmail } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const route = useRoute<any>();
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    // Model selector state
    const [models, setModels] = useState<ModelOption[]>([]);
    const [provider, setProvider] = useState<string>('');
    const [selectedSpeed, setSelectedSpeed] = useState<'fast' | 'deep'>('fast');
    const { usage, feature: chatUsage, exhausted, unavailable, refresh: refreshUsage } = useAiUsage('chat');
    const aiBlocked = exhausted || unavailable;
    // The server only accepts its model allowlist; with a single allowed model the FAST/DEEP
    // chip would be a no-op, so it's only shown when there really are two models (web parity).
    const hasModelChoice = new Set(models.map((m) => m.id)).size > 1;

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
                    // Fast/deep selection relies on this state
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
        if (!text || loading || aiBlocked) return;

        const userMsg: DisplayMessage = { id: Date.now().toString(), role: 'user', content: text };
        
        // Compute new history immediately for payload
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputText('');
        setLoading(true);

        try {
            // Resolve Fast/Deep
            let targetModel: ModelOption | undefined;
            if (models.length > 0) {
                if (selectedSpeed === 'fast') {
                    targetModel = models.find(m => /mini|flash|fast/i.test(m.id)) || models[0];
                } else {
                    targetModel = models.find(m => /pro|gpt-4o$|deep/i.test(m.id)) || models[models.length - 1];
                }
            }

            // Map our DisplayMessage to ChatMessage for the API
            const apiMessages: ChatMessage[] = newHistory.map(m => ({
                role: m.role,
                content: m.content
            }));
            
            const payload: ChatPayload = {
                user_id: userEmail || '',
                messages: apiMessages,
                model: targetModel ? targetModel.id : undefined,
                provider: targetModel ? targetModel.provider : undefined,
                // We no longer send manual period/scope. The backend will use its default.
            };

            const result = await sendChatMessageFull(accessToken || '', payload);
            const assistantMsg: DisplayMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: result.response,
                // What the backend says it resolved for this turn — never a client-side guess.
                scope: scopeLine(result.resolved_period, result.resolved_scope) ?? undefined,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            // TrackSpense v3: the AI Analyst can now create expenses (create_expense/
            // create_group_expense tools live behind this same endpoint on the backend), but
            // this screen never called any local mutation whose onSuccess would signal other
            // screens to refetch — so a chat-created expense could silently go stale everywhere
            // else. Fired after every response (cheap — it's an invalidation, not a forced
            // refetch of unmounted screens) rather than trying to parse creation intent out of
            // the assistant's free-text reply. HomeScreen/ExpensesScreen/AnalysisScreen are
            // subscribed directly; GroupsScreen's own onExpenseChanged subscription (added
            // alongside the People tab) covers ['groups']/['friend-balances'] in turn.
            notifyExpenseChanged();
        } catch (error: any) {
            const errorMsg: DisplayMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: error instanceof AiLimitError
                    ? error.message
                    : `❌ Error: ${error.message || 'Something went wrong'}`,
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            refreshUsage();
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
        const isError = !isUser && item.content.startsWith('❌');
        return (
            <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
                <View style={{ maxWidth: isUser ? '76%' : '88%', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    {!isUser && item.scope && <Text style={styles.scopeLine}>{item.scope}</Text>}
                    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, isError && styles.errorBubble]}>
                        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
                            {item.content}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderTypingIndicator = () => {
        if (!loading) return null;
        return (
            <View style={[styles.messageRow, styles.messageRowAssistant]}>
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
            <ScreenHeader
                title="Ask"
                style={{ paddingHorizontal: 22 }}
                right={hasModelChoice ? (
                    <TouchableOpacity
                        style={styles.speedChip}
                        activeOpacity={0.7}
                        onPress={() => setSelectedSpeed((v) => (v === 'fast' ? 'deep' : 'fast'))}
                        accessibilityRole="button"
                        accessibilityLabel={`Model speed: ${selectedSpeed}. Tap to switch.`}
                    >
                        <Text style={styles.speedChipText}>{selectedSpeed.toUpperCase()} ▾</Text>
                    </TouchableOpacity>
                ) : undefined}
            />

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
                                Ask anything about your spending — I'll figure out the right period, and whether to include group expenses, from what you ask.
                            </Text>

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
                            placeholder="Ask or log…"
                            placeholderTextColor={theme.colors.textTertiary}
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={() => handleSend()}
                            multiline
                            maxLength={500}
                            editable={!aiBlocked}
                        />
                        <TouchableOpacity
                            onPress={() => handleSend()}
                            disabled={!inputText.trim() || loading || aiBlocked}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Send"
                        >
                            <LinearGradient
                                colors={theme.gradients.primary}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.sendBtn, (!inputText.trim() || loading || aiBlocked) && styles.sendBtnDisabled]}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color={inkOnPastel} />
                                ) : (
                                    <Ionicons name="arrow-up" size={18} color={inkOnPastel} />
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                    <AiQuotaNote usage={usage} feature={chatUsage} />
                </View>
            </KeyboardAvoidingView>


        </LinearGradient>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
    },
    speedChip: {
        height: 30, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border,
        justifyContent: 'center',
    },
    speedChipText: { fontFamily: 'IBMPlexMono-Medium', fontSize: 10, letterSpacing: 1, color: theme.colors.textSecondary },
    // Chat area
    chatArea: { flex: 1 },
    chatContent: { paddingVertical: 12, paddingHorizontal: 22 },
    // Messages
    messageRow: { flexDirection: 'row', marginBottom: 14 },
    messageRowUser: { justifyContent: 'flex-end' },
    messageRowAssistant: { justifyContent: 'flex-start' },
    scopeLine: { fontFamily: 'IBMPlexMono-Medium', fontSize: 10, letterSpacing: 1.4, color: theme.colors.secondary, marginBottom: 7 },
    bubble: { paddingHorizontal: 15, paddingVertical: 12 },
    userBubble: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 18, borderBottomRightRadius: 6 },
    assistantBubble: {
        backgroundColor: withAlpha(theme.colors.primary, 0.1),
        borderWidth: 1, borderColor: withAlpha(theme.colors.primary, 0.22),
        borderRadius: 18, borderBottomLeftRadius: 6,
    },
    errorBubble: { backgroundColor: theme.colors.errorSurface, borderColor: withAlpha(theme.colors.error, 0.3) },
    bubbleText: { fontSize: 15, lineHeight: 22 },
    userText: { color: theme.colors.text },
    assistantText: { color: theme.colors.text },
    typingBubble: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
    typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.textTertiary },
    // Input area
    inputArea: { paddingHorizontal: 22, paddingTop: 6 },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        borderWidth: 1, borderColor: theme.colors.border, borderRadius: 18,
        backgroundColor: theme.colors.surface, paddingLeft: 16, paddingRight: 6, paddingVertical: 5,
    },
    input: {
        flex: 1,
        fontSize: 15,
        maxHeight: 100,
        minHeight: 40,
        paddingTop: 10,
        color: theme.colors.text,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { opacity: 0.4 },
    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyIconBadge: {
        width: 64, height: 64, borderRadius: 20, marginBottom: 12,
        backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 36 },
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
});

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage, ChatMessage } from '../api/chat';
import { theme } from '../theme';

function TypingIndicator() {
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animate = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
                ]),
            );
        const a1 = animate(dot1, 0);
        const a2 = animate(dot2, 150);
        const a3 = animate(dot3, 300);
        a1.start(); a2.start(); a3.start();
        return () => { a1.stop(); a2.stop(); a3.stop(); };
    }, []);

    return (
        <View style={styles.typingRow}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>🤖</Text>
            </View>
            <View style={styles.typingBubble}>
                {[dot1, dot2, dot3].map((d, i) => (
                    <Animated.View key={i} style={[styles.typingDot, { opacity: d }]} />
                ))}
            </View>
        </View>
    );
}

export default function AIAnalystScreen() {
    const { accessToken } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Hello! I\'m your financial assistant. Ask me anything about your spending habits. 💰' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const sendMessage = async () => {
        if (!input.trim() || !accessToken) return;
        const userMsg: ChatMessage = { role: 'user', content: input };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        try {
            const responseText = await sendChatMessage(accessToken, [...messages, userMsg]);
            setMessages((prev) => [...prev, { role: 'assistant', content: responseText }]);
        } catch (error) {
            setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I couldn't connect to the server." }]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages, loading]);

    const renderItem = ({ item }: { item: ChatMessage }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
                {!isUser && (
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>🤖</Text>
                    </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                    <Text style={[styles.msgText, isUser ? styles.userText : styles.botText]}>{item.content}</Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>AI Analyst</Text>
                <Text style={styles.headerSubtitle}>Your personal finance advisor</Text>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={(_, index) => String(index)}
                contentContainerStyle={[styles.listContent, { paddingBottom: 80 }]}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={loading ? <TypingIndicator /> : null}
            />

            <View style={styles.inputArea}>
                <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Ask about your spending..."
                    placeholderTextColor={theme.colors.textTertiary}
                    multiline
                />
                <TouchableOpacity
                    onPress={sendMessage}
                    disabled={loading || !input.trim()}
                    style={[styles.sendBtn, (!input.trim() && !loading) && styles.disabledBtn]}
                    activeOpacity={0.7}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.sendIcon}>➤</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: Platform.OS === 'android' ? 50 : 56 },
    header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight, backgroundColor: theme.colors.background },
    headerTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
    headerSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    listContent: { padding: 20, paddingBottom: 20 },
    messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
    userRow: { justifyContent: 'flex-end' },
    botRow: { justifyContent: 'flex-start' },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primarySurface, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    avatarText: { fontSize: 18 },
    bubble: { maxWidth: '75%', padding: 14, borderRadius: 20 },
    userBubble: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 6 },
    botBubble: { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 6, ...theme.shadows.sm },
    msgText: { fontSize: 15, lineHeight: 22 },
    userText: { color: '#fff' },
    botText: { color: theme.colors.text },
    typingRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
    typingBubble: { flexDirection: 'row', backgroundColor: theme.colors.surface, padding: 14, borderRadius: 20, borderBottomLeftRadius: 6, gap: 6, ...theme.shadows.sm },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.textTertiary },
    inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingBottom: Platform.OS === 'ios' ? 28 : 12, marginBottom: 72 },
    input: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, maxHeight: 100, marginRight: 10, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border },
    sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', ...theme.shadows.md },
    disabledBtn: { backgroundColor: theme.colors.border },
    sendIcon: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginLeft: 2 },
});

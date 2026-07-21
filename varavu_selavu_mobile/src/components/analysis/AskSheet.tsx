import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { AppTheme } from '../../theme';
import { ChangeInsight } from '../../api/analytics';
import { sendChatMessage } from '../../api/chat';

interface AskSheetProps {
    insight: ChangeInsight | null;
    onClose: () => void;
    year: number;
    month?: number;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const AskSheet: React.FC<AskSheetProps> = ({ insight, onClose, year, month }) => {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { accessToken, userEmail } = useAuth();

    const [messages, setMessages] = useState<Message[]>([]);
    const [thinking, setThinking] = useState(false);
    const [draft, setDraft] = useState('');
    const [seededFor, setSeededFor] = useState<string | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        if (insight && seededFor !== insight.metric_name) {
            const initialQuestion = `Why is my ${insight.metric_name} spend ${insight.change_amount > 0 ? 'up' : 'down'} this period?`;
            setMessages([{ role: 'user', content: initialQuestion }]);
            setSeededFor(insight.metric_name);
            submitChat([{ role: 'user', content: initialQuestion }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [insight, seededFor]);

    const submitChat = async (msgs: Message[]) => {
        if (!userEmail || !accessToken) return;
        setThinking(true);
        try {
            const response = await sendChatMessage(accessToken, {
                user_id: userEmail,
                messages: msgs,
                year,
                month,
            });
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I ran into an error getting that information for you.' }]);
        } finally {
            setThinking(false);
        }
    };

    const handleFollowUp = () => {
        if (!draft.trim() || thinking) return;
        const newMsgs = [...messages, { role: 'user', content: draft } as Message];
        setMessages(newMsgs);
        setDraft('');
        submitChat(newMsgs);
    };

    return (
        <Modal
            visible={!!insight}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.sheetContent}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Ask</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.chatContainer}
                        contentContainerStyle={styles.chatContent}
                        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    >
                        {messages.map((m, i) => {
                            const isUser = m.role === 'user';
                            return (
                                <View key={i} style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant]}>
                                    <View style={[
                                        styles.messageBubble,
                                        isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant
                                    ]}>
                                        <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAssistant]}>
                                            {m.content}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                        {thinking && (
                            <View style={[styles.messageWrapper, styles.messageWrapperAssistant]}>
                                <View style={[styles.messageBubble, styles.messageBubbleAssistant, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    <Text style={[styles.messageText, styles.messageTextAssistant]}>Thinking...</Text>
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={draft}
                            onChangeText={setDraft}
                            placeholder="Ask a follow-up..."
                            placeholderTextColor={theme.colors.textTertiary}
                            editable={!thinking}
                            onSubmitEditing={handleFollowUp}
                            returnKeyType="send"
                        />
                        <TouchableOpacity
                            onPress={handleFollowUp}
                            disabled={!draft.trim() || thinking}
                            style={[styles.sendButton, (!draft.trim() || thinking) && { opacity: 0.5 }]}
                        >
                            <Ionicons name="send" size={20} color={theme.colors.primary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheetContent: {
        backgroundColor: theme.colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '75%',
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    headerTitle: {
        fontFamily: 'InstrumentSans-Bold',
        fontSize: 18,
        color: theme.colors.text,
    },
    closeButton: {
        padding: 4,
        marginRight: -4,
    },
    chatContainer: {
        flex: 1,
        paddingHorizontal: 20,
    },
    chatContent: {
        paddingVertical: 20,
        gap: 16,
    },
    messageWrapper: {
        flexDirection: 'row',
        width: '100%',
    },
    messageWrapperUser: {
        justifyContent: 'flex-end',
    },
    messageWrapperAssistant: {
        justifyContent: 'flex-start',
    },
    messageBubble: {
        maxWidth: '85%',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
    },
    messageBubbleUser: {
        backgroundColor: theme.colors.text,
        borderBottomRightRadius: 4,
    },
    messageBubbleAssistant: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontFamily: 'InstrumentSans-Regular',
        fontSize: 15,
        lineHeight: 22,
    },
    messageTextUser: {
        color: theme.colors.surface,
    },
    messageTextAssistant: {
        color: theme.colors.text,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.borderLight,
        gap: 12,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontFamily: 'InstrumentSans-Regular',
        fontSize: 15,
        color: theme.colors.text,
    },
    sendButton: {
        padding: 8,
    },
});

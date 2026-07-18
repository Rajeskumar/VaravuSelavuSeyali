/**
 * FeedbackScreen.tsx — merged replacement for the old separate
 * FeatureRequestScreen.tsx ('feature_request') and ContactUsScreen.tsx
 * ('contact_us') drawer items. form_type is unrestricted free text
 * server-side (see SendEmailRequest/email_service.py), so introducing a
 * third 'bug_report' value for "Something's wrong" needs no backend change —
 * it just gives the inbox an accurate [BUG REPORT] subject line instead of
 * lumping it under contact_us. Mirrors the web app's FeedbackDialog.tsx
 * (same type options, same field set).
 */
import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import SegmentedTabs from '../components/SegmentedTabs';
import { sendEmail } from '../api/email';

type FeedbackType = 'feature_request' | 'bug_report' | 'contact_us';

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
    { value: 'feature_request', label: 'Idea' },
    { value: 'bug_report', label: "Something's wrong" },
    { value: 'contact_us', label: 'Question' },
];

const SUBJECT_PLACEHOLDER: Record<FeedbackType, string> = {
    feature_request: "What's your idea?",
    bug_report: 'What went wrong?',
    contact_us: "What's this about?",
};

const MESSAGE_PLACEHOLDER: Record<FeedbackType, string> = {
    feature_request: 'Describe your feature idea in detail...',
    bug_report: 'What happened, and what did you expect instead?',
    contact_us: 'How can we help?',
};

const SUBJECT_FALLBACK: Record<FeedbackType, string> = {
    feature_request: 'Feature Request',
    bug_report: 'Bug Report',
    contact_us: 'Contact form message',
};

export default function FeedbackScreen() {
    const { userEmail } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [type, setType] = useState<FeedbackType>('feature_request');
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) {
            Alert.alert('Required', 'Please describe what\'s on your mind.');
            return;
        }
        setSending(true);
        try {
            await sendEmail({
                formType: type,
                userEmail: userEmail || 'anonymous',
                subject: subject.trim() || `${SUBJECT_FALLBACK[type]}${name ? ` from ${name}` : ''}`,
                messageBody: message,
                name: name || undefined,
            });
            Alert.alert('Thank you! 🎉', 'Your message has been sent — we\'ll reply by email soon.');
            setName('');
            setSubject('');
            setMessage('');
        } catch (error) {
            Alert.alert('Error', 'Failed to submit. Please try again later.');
        } finally {
            setSending(false);
        }
    };

    return (
        <ScreenWrapper scroll>
            {/* Header */}
            <View style={styles.hero}>
                <Text style={styles.heroEmoji}>💬</Text>
                <Text style={styles.heroTitle}>Feedback</Text>
                <Text style={styles.heroSubtitle}>
                    An idea, a bug, or a question — we'd love to hear it.
                </Text>
            </View>

            <View style={styles.typeSelectorWrap}>
                <SegmentedTabs<FeedbackType> value={type} onChange={setType} options={TYPE_OPTIONS} />
            </View>

            <Card>
                <Text style={styles.fieldLabel}>Your Name (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="John Doe"
                    placeholderTextColor={theme.colors.textTertiary}
                />

                <Text style={styles.fieldLabel}>Subject (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder={SUBJECT_PLACEHOLDER[type]}
                    placeholderTextColor={theme.colors.textTertiary}
                />

                <Text style={styles.fieldLabel}>Message *</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={message}
                    onChangeText={setMessage}
                    placeholder={MESSAGE_PLACEHOLDER[type]}
                    placeholderTextColor={theme.colors.textTertiary}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                />

                <TouchableOpacity
                    style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={sending}
                    activeOpacity={0.7}
                >
                    {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.submitBtnText}>Send</Text>
                    )}
                </TouchableOpacity>
            </Card>
        </ScreenWrapper>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    hero: {
        alignItems: 'center',
        paddingVertical: 24,
        marginBottom: 8,
    },
    heroEmoji: { fontSize: 48, marginBottom: 12 },
    heroTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
    heroSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
    typeSelectorWrap: { alignItems: 'center', marginBottom: 16 },
    fieldLabel: {
        fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    input: {
        backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16,
        paddingVertical: 14, marginBottom: 16, borderWidth: 1.5,
        borderColor: theme.colors.border, fontSize: 16, color: theme.colors.text, minHeight: 48,
    },
    textArea: {
        minHeight: 120,
        paddingTop: 14,
    },
    submitBtn: {
        backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 20,
        alignItems: 'center', marginTop: 8, ...theme.shadows.colored,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

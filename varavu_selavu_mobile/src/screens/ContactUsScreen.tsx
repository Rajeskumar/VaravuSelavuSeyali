import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { sendEmail } from '../api/email';

export default function ContactUsScreen() {
    const { userEmail } = useAuth();
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const handleSubmit = async () => {
        if (!name.trim() || !subject.trim() || !message.trim()) {
            Alert.alert('Required', 'Please fill in all fields.');
            return;
        }
        setSending(true);
        try {
            await sendEmail({
                formType: 'contact_us',
                userEmail: userEmail || 'anonymous',
                subject: subject,
                messageBody: message,
                name: name,
            });
            Alert.alert('Sent! ✉️', 'Your message has been sent. We\'ll get back to you soon.');
            setName('');
            setSubject('');
            setMessage('');
        } catch (error) {
            Alert.alert('Error', 'Failed to send message. Please try again later.');
        } finally {
            setSending(false);
        }
    };

    return (
        <ScreenWrapper scroll>
            {/* Header */}
            <View style={styles.hero}>
                <Text style={styles.heroEmoji}>✉️</Text>
                <Text style={styles.heroTitle}>Contact Us</Text>
                <Text style={styles.heroSubtitle}>
                    Have a question or need help? Drop us a message.
                </Text>
            </View>

            <Card>
                <Text style={styles.fieldLabel}>Your Name *</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="John Doe"
                    placeholderTextColor={theme.colors.textTertiary}
                />

                <Text style={styles.fieldLabel}>Subject *</Text>
                <TextInput
                    style={styles.input}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="What's this about?"
                    placeholderTextColor={theme.colors.textTertiary}
                />

                <Text style={styles.fieldLabel}>Message *</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Type your message here..."
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
                        <Text style={styles.submitBtnText}>Send Message</Text>
                    )}
                </TouchableOpacity>
            </Card>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    hero: {
        alignItems: 'center',
        paddingVertical: 24,
        marginBottom: 8,
    },
    heroEmoji: { fontSize: 48, marginBottom: 12 },
    heroTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
    heroSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
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

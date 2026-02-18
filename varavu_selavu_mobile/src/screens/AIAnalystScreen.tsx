import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage, ChatMessage } from '../api/chat';
import { theme } from '../theme';

export default function AIAnalystScreen() {
  const { accessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
      { role: 'assistant', content: 'Hello! I am your financial assistant. Ask me anything about your spending habits.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
      if (!input.trim() || !accessToken) return;

      const userMsg: ChatMessage = { role: 'user', content: input };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
          const responseText = await sendChatMessage(accessToken, [...messages, userMsg]);
          setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      } catch (error) {
          setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't connect to the server." }]);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
            {!isUser && (
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>AI</Text>
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
        <View style={styles.header}>
            <Text style={theme.typography.h3}>AI Analyst</Text>
        </View>

        <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={styles.listContent}
        />

        <View style={styles.inputArea}>
            <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                multiline
            />
            <TouchableOpacity
                onPress={sendMessage}
                disabled={loading || !input.trim()}
                style={[styles.sendBtn, (!input.trim() && !loading) && styles.disabledBtn]}
            >
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendIcon}>➤</Text>}
            </TouchableOpacity>
        </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  header: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      backgroundColor: theme.colors.background,
  },
  listContent: {
      padding: 20,
      paddingBottom: 20,
  },
  messageRow: {
      flexDirection: 'row',
      marginBottom: 15,
      alignItems: 'flex-end',
  },
  userRow: {
      justifyContent: 'flex-end',
  },
  botRow: {
      justifyContent: 'flex-start',
  },
  avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
  },
  avatarText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 12,
  },
  bubble: {
      maxWidth: '75%',
      padding: 12,
      borderRadius: 20,
  },
  userBubble: {
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 4,
  },
  botBubble: {
      backgroundColor: '#fff',
      borderBottomLeftRadius: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
  },
  msgText: {
      fontSize: 15,
      lineHeight: 20,
  },
  userText: {
      color: '#fff',
  },
  botText: {
      color: '#333',
  },
  inputArea: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      paddingHorizontal: 15,
      backgroundColor: '#fff',
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
      paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  input: {
      flex: 1,
      backgroundColor: '#f5f5f5',
      borderRadius: 20,
      paddingHorizontal: 15,
      paddingVertical: 10,
      fontSize: 16,
      maxHeight: 100,
      marginRight: 10,
  },
  sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
  },
  disabledBtn: {
      backgroundColor: '#ccc',
  },
  sendIcon: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
      marginLeft: 2, // optical adjustment for arrow
  }
});

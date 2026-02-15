import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage, ChatMessage } from '../api/chat';

export default function AIAnalystScreen() {
  const { accessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
      { role: 'assistant', content: 'Hello! I can help analyze your expenses. Ask me anything like "How much did I spend on food last month?"' }
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
          setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request right now." }]);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      // Scroll to bottom on new message
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
  }, [messages]);

  const renderItem = ({ item }: { item: ChatMessage }) => (
      <View style={[
          styles.bubble,
          item.role === 'user' ? styles.userBubble : styles.botBubble
      ]}>
          <Text style={item.role === 'user' ? styles.userText : styles.botText}>{item.content}</Text>
      </View>
  );

  return (
    <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={100}
    >
        <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={styles.list}
        />

        <View style={styles.inputContainer}>
            <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about your finances..."
                onSubmitEditing={sendMessage}
            />
            <TouchableOpacity onPress={sendMessage} disabled={loading || !input.trim()} style={styles.sendBtn}>
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.sendText}>Send</Text>}
            </TouchableOpacity>
        </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
      flex: 1,
      backgroundColor: '#f5f5f5',
  },
  list: {
      padding: 15,
      paddingBottom: 20,
  },
  bubble: {
      maxWidth: '80%',
      padding: 12,
      borderRadius: 15,
      marginBottom: 10,
  },
  userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: '#007AFF',
      borderBottomRightRadius: 2,
  },
  botBubble: {
      alignSelf: 'flex-start',
      backgroundColor: 'white',
      borderBottomLeftRadius: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      elevation: 1,
  },
  userText: {
      color: 'white',
  },
  botText: {
      color: '#333',
  },
  inputContainer: {
      flexDirection: 'row',
      padding: 10,
      backgroundColor: 'white',
      borderTopWidth: 1,
      borderTopColor: '#eee',
      alignItems: 'center',
  },
  input: {
      flex: 1,
      height: 40,
      backgroundColor: '#f0f0f0',
      borderRadius: 20,
      paddingHorizontal: 15,
      marginRight: 10,
  },
  sendBtn: {
      backgroundColor: '#007AFF',
      borderRadius: 20,
      width: 60,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
  },
  sendText: {
      color: 'white',
      fontWeight: 'bold',
  }
});

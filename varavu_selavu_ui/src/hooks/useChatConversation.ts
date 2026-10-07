import { useEffect, useRef, useState } from 'react';
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  scope?: string;
}
/** Owned above responsive Drawer transitions so closing/resizing cannot discard a paid result. */
export function useChatConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<'fast' | 'deep'>('fast');
  const submitLock = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const autoSubmittedRef = useRef<number | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);
  return { messages, setMessages, query, setQuery, loading, setLoading, error, setError,
    selectedSpeed, setSelectedSpeed, submitLock, requestController, autoSubmittedRef };
}
export type ChatConversation = ReturnType<typeof useChatConversation>;

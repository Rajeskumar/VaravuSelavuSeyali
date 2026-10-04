import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, Drawer, IconButton, TextField, CircularProgress, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseRounded';
import SendIcon from '@mui/icons-material/SendRounded';
import { ChangeInsight } from '../../api/analytics';
import { fetchWithAuth } from '../../api/api';
import { aiErrorFromResponse, AiLimitError } from '../../api/aiUsage';
import { toApiHistory } from '../../utils/chatHistory';
import { useAiUsage } from '../../hooks/useAiUsage';
import AiQuotaNote from '../common/AiQuotaNote';

interface AskSheetProps {
  insight: ChangeInsight | null;
  onClose: () => void;
  year: number;
  month?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean; // client-side error bubble: shown, never sent back to the model
}

export const AskSheet: React.FC<AskSheetProps> = ({ insight, onClose, year, month }) => {
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { usage, feature: chatUsage, exhausted, unavailable, refresh: refreshUsage } = useAiUsage('chat');
  const aiBlocked = exhausted || unavailable;

  useEffect(() => {
    if (insight && seededFor !== insight.metric_name) {
      const initialQuestion = `Why is my ${insight.metric_name} spend ${insight.change_amount > 0 ? 'up' : 'down'} this period?`;
      setMessages([{ role: 'user', content: initialQuestion }]);
      setSeededFor(insight.metric_name);
      submitChat([{ role: 'user', content: initialQuestion }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight, seededFor]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const submitChat = async (msgs: Message[]) => {
    setThinking(true);
    try {
      const res = await fetchWithAuth(`/api/v1/analysis/chat`, {
        method: "POST",
        body: JSON.stringify({
          messages: toApiHistory(msgs),
          year,
          month,
        }),
      });

      if (!res.ok) {
        throw await aiErrorFromResponse(res, "Chat failed");
      }
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || data.reply || 'No response' }]);
    } catch (e) {
      const content = e instanceof AiLimitError
        ? e.message
        : 'Sorry, I ran into an error getting that information for you.';
      setMessages(prev => [...prev, { role: 'assistant', content, isError: true }]);
    } finally {
      setThinking(false);
      refreshUsage();
    }
  };

  const handleFollowUp = () => {
    if (!draft.trim() || thinking || aiBlocked) return;
    const newMsgs = [...messages, { role: 'user', content: draft } as Message];
    setMessages(newMsgs);
    setDraft('');
    submitChat(newMsgs);
  };

  return (
    <Drawer
      anchor="bottom"
      open={!!insight}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxWidth: 600,
          margin: '0 auto',
          width: '100%',
          height: '75vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2, pb: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
          Ask
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ mt: -1, mr: -1, color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.map((m, i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <Box
              sx={{
                maxWidth: '85%',
                backgroundColor: m.role === 'user' ? 'text.primary' : 'background.paper',
                border: m.role === 'assistant' ? `1px solid ${theme.palette.divider}` : 'none',
                color: m.role === 'user' ? 'background.default' : 'text.primary',
                borderRadius: 1,
                borderBottomRightRadius: m.role === 'user' ? 1 : 3,
                borderBottomLeftRadius: m.role === 'assistant' ? 1 : 3,
                px: 2,
                py: 1.5,
                fontFamily: 'Instrument Sans',
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
            >
              {m.content}
            </Box>
          </Box>
        ))}
        {thinking && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              sx={{
                backgroundColor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                borderBottomLeftRadius: 1,
                px: 2,
                py: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CircularProgress size={16} />
              <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 14, color: 'text.secondary' }}>
                Thinking...
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFollowUp(); }}
          placeholder="Ask a follow-up..."
          fullWidth
          size="small"
          disabled={thinking || aiBlocked}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 999,
              fontFamily: 'Instrument Sans',
              fontSize: 14,
              backgroundColor: 'background.paper',
            }
          }}
        />
        <IconButton onClick={handleFollowUp} aria-label="Send question" color="primary" disabled={!draft.trim() || thinking || aiBlocked}>
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
      <AiQuotaNote usage={usage} feature={chatUsage} />
      </Box>
    </Drawer>
  );
};

import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, TextField, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/SendRounded';
import { fetchWithAuth } from '../../api/api';
import { getModels, ModelsResponse, ModelOption } from '../../api/models';
import SegmentedTabs from '../common/SegmentedTabs';
import { typeScale } from '../../theme';

interface AIAnalystChatProps {
  userId: string | null;
  initialQuery?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  scope?: string;
}

const SUGGESTED_PROMPTS = [
  "What were my top spending categories?",
  "How much did I spend at Amazon?",
  "Has the price of milk gone up?",
  "Where did I buy eggs cheapest?"
];

export default function AIAnalystChat({ userId, initialQuery }: AIAnalystChatProps) {
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedSpeed, setSelectedSpeed] = useState<'fast' | 'deep'>('fast');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    getModels(ac.signal)
      .then((res: ModelsResponse) => {
        setModels(res.models);
      })
      .catch((e) => {
        console.error('Failed to load models', e);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, error]);

  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      handleSubmit(undefined, initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = overrideQuery || query;
    if (!finalQuery.trim()) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: finalQuery }];
    setMessages(newMessages);
    setQuery("");
    setLoading(true);
    setError(null);

    // Resolve Fast/Deep
    let targetModel: ModelOption | null = null;
    if (models.length > 0) {
      if (selectedSpeed === 'fast') {
        targetModel = models.find(m => /mini|flash|fast/i.test(m.id)) || models[0];
      } else {
        targetModel = models.find(m => /pro|gpt-4o$|deep/i.test(m.id)) || models[models.length - 1];
      }
    }

    try {
      const res = await fetchWithAuth(`/api/v1/analysis/chat`, {
        method: "POST",
        body: JSON.stringify({
          // The API expects {role, content}
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          model: targetModel ? targetModel.id : undefined,
          provider: targetModel ? targetModel.provider : undefined,
          // We no longer send manual period/scope. The backend will use its default (e.g. last 3 months).
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail || "Unknown error");
      }

      const data = await res.json();
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: data.response || data.reply,
          // TODO: Replace this hardcoded placeholder with real scope intent from the backend once implemented.
          // TS-DES-109: The backend does not currently resolve free-text -> {period, scope}.
          scope: 'This month · My Expenses'
        }
      ]);
    } catch (err: any) {
      const msg = err.message ?? "An error occurred";
      const isTechnical = /quota|429|500|502|503|api.key|insufficient/i.test(msg);
      setError(isTechnical ? "The AI analyst is temporarily unavailable. Please try again later." : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (prompt: string) => {
    handleSubmit(undefined, prompt);
  };

  const formatMarkdown = (text: string) => {
    const lines = text.split('\n');
    let html: string[] = [];
    let table: string[] = [];

    const formatInline = (line: string) =>
      line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">$1</code>');

    const flushTable = () => {
      if (table.length === 0) return;
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.9em;">';
      const rows = table.filter(r => !/^\s*\|?[-:]+[-|:]+\s*$/.test(r)); // strip separator
      rows.forEach((r, i) => {
        const cells = r.split('|').filter(Boolean).map(c => c.trim());
        const tag = i === 0 ? 'th' : 'td';
        const bg = i === 0 ? 'rgba(0,0,0,0.04)' : 'transparent';
        tableHtml += '<tr>' + cells.map(c => `<${tag} style="border: 1px solid ${theme.palette.divider}; padding: 8px; background: ${bg}; text-align: left;">${formatInline(c)}</${tag}>`).join('') + '</tr>';
      });
      tableHtml += '</table>';
      html.push(tableHtml);
      table = [];
    };

    lines.forEach(line => {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        table.push(line);
        return;
      }
      flushTable();
      const heading = line.match(/^\s*(#{1,6})\s*(.*)$/);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level} style="margin: 8px 0; font-family: Inter; font-weight: 600;">${formatInline(heading[2])}</h${level}>`);
      } else if (/^\s*[-\*]\s+/.test(line)) {
        const item = line.replace(/^\s*[-\*]\s+/, '');
        html.push(`<p style="margin: 4px 0;">• ${formatInline(item)}</p>`);
      } else if (line.trim()) {
        html.push(`<p style="margin: 8px 0;">${formatInline(line)}</p>`);
      }
    });
    flushTable();
    return html.join('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 3, pt: 3, pb: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ ...typeScale.display, fontSize: 22, color: 'text.primary' }}>
          AI Analyst
        </Typography>
        <Box sx={{ width: 140 }}>
          <SegmentedTabs
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'deep', label: 'Deep' }
            ]}
            value={selectedSpeed}
            onChange={(v) => setSelectedSpeed(v as 'fast' | 'deep')}
            size="small"
            fullWidth
          />
        </Box>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography sx={{ fontFamily: 'Inter', fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>
              Ask anything about your spending — I'll figure out the right period, and whether to
              include group expenses, from what you ask.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {SUGGESTED_PROMPTS.map((p, idx) => (
                <Box
                  key={idx}
                  component="button"
                  onClick={() => handleChipClick(p)}
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: 14,
                    color: 'text.primary',
                    backgroundColor: 'background.paper',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2.5,
                    padding: '12px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background-color 0.2s',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    }
                  }}
                >
                  {p}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {messages.map((m, i) => (
          <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <Box
              sx={{
                maxWidth: '85%',
                backgroundColor: m.role === 'user' ? 'text.primary' : 'background.paper',
                border: m.role === 'user' ? 'none' : `1px solid ${theme.palette.divider}`,
                color: m.role === 'user' ? 'background.paper' : 'text.primary',
                borderRadius: 3,
                borderBottomRightRadius: m.role === 'user' ? 1 : 3,
                borderBottomLeftRadius: m.role === 'assistant' ? 1 : 3,
                px: 2,
                py: 1.5,
                fontFamily: 'Inter',
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal'
              }}
            >
              {m.role === 'user' ? (
                m.content
              ) : (
                <div dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }} />
              )}
            </Box>
            
            {m.role === 'assistant' && m.scope && (
              <Typography sx={{ fontFamily: 'Inter', fontSize: 11, color: 'text.secondary', mt: 1, ml: 0.5 }}>
                Looked at: {m.scope}
              </Typography>
            )}
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              sx={{
                backgroundColor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 3,
                borderBottomLeftRadius: 1,
                px: 2,
                py: 1.5,
                fontFamily: 'Inter',
                fontSize: 14,
                color: 'text.secondary'
              }}
            >
              Thinking…
            </Box>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Typography color="error" sx={{ fontFamily: 'Inter', fontSize: 13 }}>
              {error}
            </Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask about your spending…"
          fullWidth
          size="small"
          disabled={loading}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 999,
              fontFamily: 'Inter',
              fontSize: 14,
              backgroundColor: 'background.paper',
            }
          }}
        />
        <IconButton 
          onClick={handleSubmit} 
          disabled={!query.trim() || loading}
          sx={{ 
            bgcolor: 'primary.main', 
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' }
          }}
        >
          <SendIcon fontSize="small" sx={{ ml: 0.5 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

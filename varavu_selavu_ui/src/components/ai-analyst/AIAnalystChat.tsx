import { useChatConversation, ChatConversation, Message } from '../../hooks/useChatConversation';
import { ensureAiConsent } from '../../utils/aiConsent';
import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, TextField, IconButton, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/SendRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { fetchWithAuth } from '../../api/api';
import { getModels, ModelsResponse, ModelOption } from '../../api/models';
import SegmentedTabs from '../common/SegmentedTabs';
import { typeScale } from '../../theme';
import { escapeHtml } from '../../utils/html';
import { aiErrorFromResponse, AiLimitError } from '../../api/aiUsage';
import { useAiUsage } from '../../hooks/useAiUsage';
import AiQuotaNote from '../common/AiQuotaNote';

interface AIAnalystChatProps {
  userId: string | null;
  conversation?: ChatConversation;
  initialQuery?: string;
  initialQueryId?: number;
  /** TS-DES-207 — rendered as a close (X) button in the header when this component is hosted
   * inside an ambient overlay/sheet rather than a full page. Omit for the full-page route. */
  onClose?: () => void;
}



/** "July 2026 · My spending" from the backend's resolved period/scope, or null when it would
 * only restate a default period the user never asked about. */
function scopeLabel(
  period?: { label?: string; source?: string },
  scope?: { kind?: string; group_name?: string | null },
): string | null {
  const parts: string[] = [];
  if (period?.label && period.source !== 'default') parts.push(period.label);
  if (scope?.kind === 'group') parts.push(scope.group_name || 'A group');
  else if (scope && parts.length > 0) parts.push('My spending');
  return parts.length ? parts.join(' · ') : null;
}

const SUGGESTED_PROMPTS = [
  "What were my top spending categories?",
  "How much did I spend at Amazon?",
  "Has the price of milk gone up?",
  "Where did I buy eggs cheapest?"
];

export default function AIAnalystChat({ userId: _userId, initialQuery, initialQueryId = 0, onClose, conversation }: AIAnalystChatProps) {
  const theme = useTheme();
  const localConversation = useChatConversation();
  const { messages, setMessages, query, setQuery, loading, setLoading, error, setError,
    selectedSpeed, setSelectedSpeed, submitLock, requestController, autoSubmittedRef } = conversation || localConversation;
  const [slow, setSlow] = useState(false);

  const [models, setModels] = useState<ModelOption[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { usage, feature: chatUsage, exhausted, unavailable, refresh: refreshUsage } = useAiUsage('chat');
  const aiBlocked = exhausted || unavailable;
  // The server only accepts its model allowlist; with a single allowed model the Quick/Thorough
  // choice would be a no-op, so it's only shown when there really are two models to pick from.
  const hasModelChoice = new Set(models.map(m => m.id)).size > 1;

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

  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    if (initialQuery && autoSubmittedRef.current !== initialQueryId) {
      autoSubmittedRef.current = initialQueryId;
      if (submitLock.current) {
        setQuery(initialQuery);
        setError('Your current question is still being answered. Send this question when it finishes.');
      } else handleSubmit(undefined, initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, initialQueryId]);

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = overrideQuery || query;
    if (!finalQuery.trim() || aiBlocked || submitLock.current) return;
    submitLock.current = true;
    // Questions are answered by a third-party AI service; get the person's agreement first.
    if (!(await ensureAiConsent())) {
      submitLock.current = false;
      setError('Ask needs AI features. Allow them when prompted to continue.');
      return;
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: finalQuery }];
    setMessages(newMessages);
    setQuery("");
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    requestController.current = controller;

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
        signal: controller.signal,
        body: JSON.stringify({
          // The API expects {role, content}
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          model: targetModel ? targetModel.id : undefined,
          provider: targetModel ? targetModel.provider : undefined,
          // We no longer send manual period/scope. The backend will use its default (e.g. last 3 months).
        }),
      });

      if (!res.ok) {
        throw await aiErrorFromResponse(res, "Unknown error");
      }

      const data = await res.json();
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: data.response || data.reply,
          // Built from what the backend says it resolved (same rule as mobile's scopeLine): this was
          // a hard-coded "This month · My Expenses" on every answer, including all-time ones.
          scope: scopeLabel(data.resolved_period, data.resolved_scope) ?? undefined
        }
      ]);
    } catch (err: any) {
      const msg = err.message ?? "An error occurred";
      const isTechnical = /quota|429|500|502|503|api.key|insufficient/i.test(msg);
      setError(err instanceof AiLimitError || !isTechnical ? msg : "The AI analyst is temporarily unavailable. Please try again later.");
    } finally {
      submitLock.current = false;
      requestController.current = null;
      setLoading(false);
      refreshUsage();
    }
  };

  const handleChipClick = (prompt: string) => {
    handleSubmit(undefined, prompt);
  };

  const formatMarkdown = (text: string) => {
    const lines = text.split('\n');
    let html: string[] = [];
    let table: string[] = [];

    // Escape before any substitution: model output reflects stored expense text,
    // so raw markup here would be stored XSS via dangerouslySetInnerHTML below.
    const formatInline = (line: string) =>
      escapeHtml(line)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, `<code style="background: ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}; padding: 2px 4px; border-radius: 4px;">$1</code>`);

    const flushTable = () => {
      if (table.length === 0) return;
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.9em;">';
      const rows = table.filter(r => !/^\s*\|?[-:]+[-|:]+\s*$/.test(r)); // strip separator
      rows.forEach((r, i) => {
        const cells = r.split('|').filter(Boolean).map(c => c.trim());
        const tag = i === 0 ? 'th' : 'td';
        const bg = i === 0 ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent';
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
      } else if (/^\s*[-*]\s+/.test(line)) {
        const item = line.replace(/^\s*[-*]\s+/, '');
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
      <Box sx={{ px: 3, pt: 3, pb: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography component="h2" sx={{ ...typeScale.display, fontSize: 22, color: 'text.primary' }}>
          Ask
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* UI-12: "Fast/Deep" named the mechanism, not the choice. These pick a smaller vs a
              larger model (see the model resolution in handleSend) — say what that means. */}
          {hasModelChoice && (
          <Box sx={{ width: 170, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            <SegmentedTabs
              options={[
                { value: 'fast', label: 'Quick' },
                { value: 'deep', label: 'Thorough' }
              ]}
              value={selectedSpeed}
              onChange={(v) => setSelectedSpeed(v as 'fast' | 'deep')}
              size="small"
              fullWidth
              ariaLabel="Answer depth"
            />
            <Typography sx={{ fontSize: 11, color: 'text.secondary', textAlign: 'right', lineHeight: 1.3 }}>
              {selectedSpeed === 'fast' ? 'Faster model, good for totals and lookups' : 'Larger model, better for multi-step questions'}
            </Typography>
          </Box>
          )}
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="Close Ask">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Messages */}
      {/* role="log" + polite: each new message is announced as it's appended, without moving focus
          away from the input. tabIndex makes the scrollable transcript keyboard-reachable. */}
      <Box
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        tabIndex={0}
        sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>
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
                    fontFamily: 'Instrument Sans',
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
                color: m.role === 'user' ? 'background.default' : 'text.primary',
                borderRadius: 3,
                borderBottomRightRadius: m.role === 'user' ? 1 : 3,
                borderBottomLeftRadius: m.role === 'assistant' ? 1 : 3,
                px: 2,
                py: 1.5,
                fontFamily: 'Instrument Sans',
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
              <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 11, color: 'text.secondary', mt: 1, ml: 0.5 }}>
                Looked at: {m.scope}
              </Typography>
            )}
          </Box>
        ))}

        {loading && (
          <Box role="status" sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              sx={{
                backgroundColor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 3,
                borderBottomLeftRadius: 1,
                px: 2,
                py: 1.5,
                fontFamily: 'Instrument Sans',
                fontSize: 14,
                color: 'text.secondary'
              }}
            >
              {slow ? 'Still working. You can close Ask and return to the result.' : 'Thinking…'}
              <Button sx={{ minHeight: 44 }} onClick={() => requestController.current?.abort()}>Stop waiting</Button>
            </Box>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Typography role="alert" color="error" sx={{ fontFamily: 'Instrument Sans', fontSize: 13 }}>
              {error}
            </Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
          disabled={loading || aiBlocked}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 999,
              fontFamily: 'Instrument Sans',
              // 16px on phones: smaller input text is hard to read, and iOS Safari zooms the page
              // when a <16px field is focused.
              fontSize: { xs: 16, md: 14 },
              backgroundColor: 'background.paper',
            }
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Ask about your spending', enterKeyHint: 'send' } }}
        />
        <IconButton
          onClick={handleSubmit}
          aria-label="Send message"
          disabled={!query.trim() || loading || aiBlocked}
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
      <AiQuotaNote usage={usage} feature={chatUsage} />
      </Box>
    </Box>
  );
}

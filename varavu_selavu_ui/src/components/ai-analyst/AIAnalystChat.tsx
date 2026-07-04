import { Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Select, TextField, Typography, Chip, Tooltip, IconButton, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useState, useRef, useEffect } from "react";
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { fetchWithAuth } from '../../api/api';
import { getModels, ModelsResponse, ModelOption } from '../../api/models';
import { glassCardSx } from '../../theme';

interface AIAnalystChatProps {
  userId: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
    "What were my top spending categories?",
    "How much did I spend at Amazon?",
    "Has the price of milk gone up?",
    "Where did I buy eggs cheapest?"
];

export default function AIAnalystChat({ userId }: AIAnalystChatProps) {
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    getModels(ac.signal)
      .then((res: ModelsResponse) => {
        setModels(res.models);
        if (res.models.length > 0) {
          const firstProv = res.models[0].provider;
          setSelectedProvider(firstProv);
          setSelectedModel(res.models[0]);
        }
      })
      .catch((e) => {
        console.error('Failed to load models', e);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = overrideQuery || query;
    if (!finalQuery.trim()) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: finalQuery }];
    setMessages(newMessages);
    setQuery("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/v1/analysis/chat`, {
        method: "POST",
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel ? selectedModel.id : undefined,
          provider: selectedModel ? selectedModel.provider : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail || "Unknown error");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: any) {
      const msg = err.message ?? "An error occurred";
      // Don't surface raw upstream API errors to the user
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
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    const flushTable = () => {
      if (table.length === 0) return;
      const [header, separator, ...rows] = table;
      const headers = header.split('|').filter(Boolean).map(h => h.trim());
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin-bottom: 10px;"><thead><tr>' + headers.map(h => `<th style="border: 1px solid #ddd; padding: 8px;">${formatInline(h)}</th>`).join('') + '</tr></thead><tbody>';
      rows.forEach(r => {
        const cells = r.split('|').filter(Boolean).map(c => c.trim());
        tableHtml += '<tr>' + cells.map(c => `<td style="border: 1px solid #ddd; padding: 8px;">${formatInline(c)}</td>`).join('') + '</tr>';
      });
      tableHtml += '</tbody></table>';
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
        html.push(`<h${level} style="margin: 8px 0;">${formatInline(heading[2])}</h${level}>`);
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
    <Box className="ai-analyst-chat" sx={{ maxWidth: 720, mx: 'auto', p: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Card
        sx={{
          ...glassCardSx(theme),
          animation: 'fadeIn 0.5s ease',
          display: 'flex',
          flexDirection: 'column',
          height: '75vh'
        }}
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, p: 2, pb: 1, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">Ask the AI Analyst</Typography>
              <Tooltip title="By default, the analyst uses the last 3 months of data unless you specify a timeframe (e.g. 'in 2022' or 'last year')." arrow>
                <IconButton size="small">
                  <InfoOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            {models.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="provider-label">Provider</InputLabel>
                  <Select
                    labelId="provider-label"
                    value={selectedProvider}
                    label="Provider"
                    onChange={(e) => {
                      const prov = e.target.value;
                      setSelectedProvider(prov);
                      const firstModel = models.find(m => m.provider === prov);
                      if (firstModel) setSelectedModel(firstModel);
                    }}
                  >
                    {Array.from(new Set(models.map(m => m.provider))).map(p => (
                      <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="model-label">Model</InputLabel>
                  <Select
                    labelId="model-label"
                    value={selectedModel ? selectedModel.id : ""}
                    label="Model"
                    onChange={(e) => {
                      const found = models.find(m => m.id === e.target.value && m.provider === selectedProvider);
                      if (found) setSelectedModel(found);
                    }}
                  >
                    {models.filter(m => m.provider === selectedProvider).map((m) => (
                      <MenuItem key={`${m.provider}-${m.id}`} value={m.id}>{m.id}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>

          {/* Chat History Area */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 2, display: 'flex', flexDirection: 'column', gap: 2, pr: 1 }}>
            {messages.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                <Typography variant="body1">Start a conversation by asking a question below.</Typography>
              </Box>
            ) : (
              messages.map((msg, idx) => (
                <Box key={idx} sx={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      px: 2,
                      maxWidth: '85%',
                      borderRadius: 3,
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                      color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      border: msg.role === 'assistant' ? '1px solid rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    {msg.role === 'user' ? (
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
                    ) : (
                      <div
                        style={{ fontSize: 16 }}
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                      />
                    )}
                  </Paper>
                </Box>
              ))
            )}
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Paper elevation={0} sx={{ p: 1.5, px: 2, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <Typography variant="body2" color="text.secondary">Thinking...</Typography>
                </Paper>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {error && <Typography color="error" sx={{ mb: 1, fontSize: '0.85rem' }}>{error}</Typography>}

          {/* Input Area */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto' }}
          >
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <Chip
                  key={i}
                  label={prompt}
                  onClick={() => handleChipClick(prompt)}
                  disabled={loading}
                  variant="outlined"
                  size="small"
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={"Ask about a merchant, item price, or where you got the best deal..."}
                fullWidth
                size="small"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Button type="submit" variant="contained" disabled={loading || !query.trim()}>
                Send
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

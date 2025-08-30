import { Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import React, { useState } from "react";
import { fetchWithAuth } from '../../api/api';
import { getModels, ModelsResponse } from '../../api/models';

interface AIAnalystChatProps {
  userId: string | null;
  startDate: string;
  endDate: string;
}

export default function AIAnalystChat({ userId, startDate, endDate }: AIAnalystChatProps) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");

  React.useEffect(() => {
    const ac = new AbortController();
    getModels(ac.signal)
      .then((res: ModelsResponse) => {
        setModels(res.models);
        setProvider(res.provider);
        setModel(currentModel => {
          if (res.models.length && !currentModel) {
            return res.models[0];
          }
          return currentModel;
        });
      })
      .catch((e) => {
        console.error('Failed to load models', e);
        // Non-fatal; user can still chat with default backend model
      });
    return () => ac.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResponse("");
    try {
      const res = await fetchWithAuth(`/api/v1/analysis/chat`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          query,
          start_date: startDate,
          end_date: endDate,
          model: model || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail || "Unknown error");
      }

      const data = await res.json();
      setResponse(data.response);
    } catch (err: any) {
      setError(err.message ?? "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const scopeLabel = `${startDate} to ${endDate}`;

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
      let tableHtml = '<table><thead><tr>' + headers.map(h => `<th>${formatInline(h)}</th>`).join('') + '</tr></thead><tbody>';
      rows.forEach(r => {
        const cells = r.split('|').filter(Boolean).map(c => c.trim());
        tableHtml += '<tr>' + cells.map(c => `<td>${formatInline(c)}</td>`).join('') + '</tr>';
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
      const heading = line.match(/^\s*(#{1,6})\s*(.*)$/); // support headings with or without a space
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      } else if (/^\s*[-\*]\s+/.test(line)) {
        // simple bullet support: wrap each bullet as a paragraph with a dash
        const item = line.replace(/^\s*[-\*]\s+/, '');
        html.push(`<p>• ${formatInline(item)}</p>`);
      } else if (line.trim()) {
        html.push(`<p>${formatInline(line)}</p>`);
      }
    });
    flushTable();
    return html.join('');
  };

  return (
    <Box className="ai-analyst-chat" sx={{ maxWidth: 720, mx: 'auto', p: 1 }}>
      <Card
        sx={{
          backdropFilter: 'blur(8px)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(240,248,255,0.65) 100%)',
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
          borderRadius: 3,
          animation: 'fadeIn 0.5s ease'
        }}
      >
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Ask the AI Analyst — {scopeLabel}</Typography>
          {models.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="model-label">Model {provider ? `(${provider})` : ''}</InputLabel>
                <Select
                  labelId="model-label"
                  value={model}
                  label={`Model ${provider ? `(${provider})` : ''}`}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {models.map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={"e.g. What were my top categories?"}
              multiline
              minRows={4}
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={loading || !query.trim()}>
              {loading ? 'Thinking…' : 'Send'}
            </Button>
          </Box>

          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}

          {response && (
            <Card
              variant="outlined"
              sx={{
                mt: 2,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(245,255,248,0.65) 100%)',
                border: '1px solid rgba(255,255,255,0.35)'
              }}
            >
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>Answer</Typography>
                <div
                  style={{ fontSize: 16 }}
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(response) }}
                />
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

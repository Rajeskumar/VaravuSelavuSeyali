import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
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
    return text
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  };

  return (
    <div className="ai-analyst-chat" style={{ maxWidth: 600, margin: '0 auto', padding: 8 }}>
      <h3 style={{ fontSize: 20, marginBottom: 12 }}>Ask the AI Analyst — {scopeLabel}</h3>
      {models.length > 0 && (
        <div style={{ marginBottom: 12 }}>
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
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={"e.g. What were my top categories?"}
          rows={4}
          style={{ width: '100%', fontSize: 16, borderRadius: 6, padding: 8, border: '1px solid #ccc', resize: 'vertical' }}
        />
        <button type="submit" disabled={loading || !query.trim()} style={{ fontSize: 16, padding: '8px 0', borderRadius: 6, background: '#1976d2', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? "Thinking…" : "Send"}
        </button>
      </form>

      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}

      {response && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.5rem",
            background: "#f9f9f9",
            borderRadius: 6,
            fontSize: 16
          }}
        >
          <strong>Answer:</strong>
          <div
            style={{ margin: 0 }}
            dangerouslySetInnerHTML={{ __html: formatMarkdown(response) }}
          />
        </div>
      )}
    </div>
  );
}

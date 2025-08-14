import React, { useState } from "react";
import API_BASE_URL from '../../api/apiconfig';

interface ChatProps {
    userId: string | null;
    startDate: string;
    endDate: string;
}

export default function ExpenseChat({ userId, startDate, endDate }: ChatProps) {
    const [query, setQuery] = useState("");
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setResponse("");
        console.log('Environemnt url : ', API_BASE_URL);
        try {
            const res = await fetch(`${API_BASE_URL}/analysis/chat`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    user_id: userId,
                    query,
                    start_date: startDate,
                    end_date: endDate,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Unknown error");
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

    return (
        <div className="analysis-chat" style={{ maxWidth: 600, margin: '0 auto', padding: 8 }}>
            <h3 style={{ fontSize: 20, marginBottom: 12 }}>Ask a question about your spending — {scopeLabel}</h3>
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
                    <p style={{ margin: 0 }}>{response}</p>
                </div>
            )}
        </div>
    );
}

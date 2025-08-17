import React, { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { parseReceipt, addExpenseWithItems } from '../../api/expenses';

const UploadReceiptForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleParse = async () => {
    if (!file) return;
    try {
      const res = await parseReceipt(file);
      setDraft(res);
    } catch (e) {
      setMessage('Failed to parse receipt');
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    const user = localStorage.getItem('vs_user');
    if (!user) {
      setMessage('Please login first.');
      return;
    }
    const payload = {
      user_email: user,
      header: { ...draft.header, fingerprint: draft.fingerprint },
      items: draft.items.map((i: any) => ({ ...i })),
    };
    try {
      setSaving(true);
      await addExpenseWithItems(payload);
      setMessage('Expense saved');
      setDraft(null);
      setFile(null);
    } catch (e) {
      setMessage('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const reconcileOk = () => {
    if (!draft) return false;
    const subtotal = draft.items.reduce((s: number, it: any) => s + (it.line_total || 0), 0);
    const { tax = 0, tip = 0, discount = 0, amount = 0 } = draft.header;
    return Math.abs(subtotal + tax + tip - discount - amount) <= 0.02;
  };

  return (
    <Box>
      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
      <Button onClick={handleParse} disabled={!file}>Parse</Button>
      {draft && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1">Header</Typography>
          <TextField
            label="Merchant"
            value={draft.header.merchant_name || ''}
            onChange={e => setDraft({ ...draft, header: { ...draft.header, merchant_name: e.target.value } })}
            fullWidth
            sx={{ mb: 1 }}
          />
          <TextField
            label="Purchased At"
            value={draft.header.purchased_at || ''}
            onChange={e => setDraft({ ...draft, header: { ...draft.header, purchased_at: e.target.value } })}
            fullWidth
            sx={{ mb: 1 }}
          />
          <Typography variant="subtitle1">Items</Typography>
          {draft.items.map((item: any, idx: number) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                label="Name"
                value={item.item_name}
                onChange={e => {
                  const items = [...draft.items];
                  items[idx].item_name = e.target.value;
                  setDraft({ ...draft, items });
                }}
              />
              <TextField
                label="Line Total ($)"
                type="number"
                value={item.line_total}
                onChange={e => {
                  const items = [...draft.items];
                  items[idx].line_total = parseFloat(e.target.value) || 0;
                  setDraft({ ...draft, items });
                }}
              />
            </Box>
          ))}
          <Typography color={reconcileOk() ? 'green' : 'red'}>
            {reconcileOk() ? 'Totals match' : 'Totals mismatch'}
          </Typography>
          <Button onClick={handleSave} disabled={!reconcileOk() || saving}>Save</Button>
        </Box>
      )}
      {message && <Typography sx={{ mt: 1 }}>{message}</Typography>}
    </Box>
  );
};

export default UploadReceiptForm;

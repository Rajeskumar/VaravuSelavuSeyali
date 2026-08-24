import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, Button, TextField, IconButton, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import CategoryPickerField from '../expenses/CategoryPickerField';
import { findMainCategory } from '../expenses/AddExpenseForm';
import { createCustomCard } from '../../api/cards';

const ALL_PURCHASES = 'All Purchases';

interface RuleRow {
  categoryId: string; // '' = not yet picked, or ALL_PURCHASES, or a real sub-category
  multiplier: string;
}

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

/**
 * TS-CARD-112 — "add your own card" form. Categories are restricted to the app's real taxonomy
 * (via CategoryPickerField, same component every expense form uses) plus the "All Purchases"
 * flat-rate sentinel — never free text, so a self-reported rule can't reference a category that
 * doesn't exist (enforced again server-side in CardService.create_custom_card).
 */
const CustomCardForm: React.FC<Props> = ({ onDone, onCancel }) => {
  const qc = useQueryClient();
  const [cardName, setCardName] = React.useState('');
  const [issuer, setIssuer] = React.useState('');
  const [annualFee, setAnnualFee] = React.useState('');
  const [rules, setRules] = React.useState<RuleRow[]>([{ categoryId: ALL_PURCHASES, multiplier: '1' }]);

  const hasFlatRate = rules.some((r) => r.categoryId === ALL_PURCHASES);

  const createMut = useMutation({
    mutationFn: () =>
      createCustomCard({
        card_name: cardName.trim(),
        issuer: issuer.trim() || undefined,
        annual_fee: annualFee ? parseFloat(annualFee) : 0,
        rules: rules
          .filter((r) => r.categoryId && parseFloat(r.multiplier) > 0)
          .map((r) => ({ category_id: r.categoryId, multiplier: parseFloat(r.multiplier) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards-mine'] });
      qc.invalidateQueries({ queryKey: ['card-coach'] });
      onDone();
    },
  });

  const updateRule = (idx: number, patch: Partial<RuleRow>) =>
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRule = (idx: number) => setRules((rs) => rs.filter((_, i) => i !== idx));

  const canSave = cardName.trim().length > 0 && !createMut.isPending;

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.2, p: 2, mt: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1.5 }}>Add your own card</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField size="small" label="Card name" value={cardName} onChange={(e) => setCardName(e.target.value)} autoFocus fullWidth />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField size="small" label="Issuer (optional)" value={issuer} onChange={(e) => setIssuer(e.target.value)} fullWidth />
          <TextField
            size="small" label="Annual fee" type="number" value={annualFee}
            onChange={(e) => setAnnualFee(e.target.value)}
            InputProps={{ startAdornment: <Box component="span" sx={{ mr: 0.5, color: 'text.secondary' }}>$</Box> }}
            sx={{ width: 140, flexShrink: 0 }}
          />
        </Box>

        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mt: 0.5 }}>Cash back rates</Typography>
        {rules.map((rule, idx) => (
          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {rule.categoryId === ALL_PURCHASES ? (
              <Box sx={{ flex: 1, px: 1.5, py: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>All Purchases (flat rate)</Typography>
              </Box>
            ) : (
              <Box sx={{ flex: 1 }}>
                <CategoryPickerField
                  mainCategory={findMainCategory(rule.categoryId)}
                  subcategory={rule.categoryId}
                  onChange={(_main, sub) => updateRule(idx, { categoryId: sub })}
                />
              </Box>
            )}
            <TextField
              size="small" label="%" type="number" value={rule.multiplier}
              onChange={(e) => updateRule(idx, { multiplier: e.target.value })}
              sx={{ width: 90, flexShrink: 0 }}
            />
            <IconButton size="small" onClick={() => removeRule(idx)} aria-label="Remove rate">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setRules((rs) => [...rs, { categoryId: '', multiplier: '1' }])}>
            Add category rate
          </Button>
          {!hasFlatRate && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => setRules((rs) => [...rs, { categoryId: ALL_PURCHASES, multiplier: '1' }])}>
              Add flat rate
            </Button>
          )}
        </Box>

        {rules.length === 0 && (
          <Alert severity="info" sx={{ fontSize: 12.5 }}>
            No rates set yet — a card with no rates earns nothing tracked (fine for a store-only card, otherwise add at least one rate above).
          </Alert>
        )}
        {createMut.isError && <Alert severity="error">Failed to save — try again.</Alert>}

        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
          <Button variant="contained" disabled={!canSave} onClick={() => createMut.mutate()}>
            Save card
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </Box>
      </Box>
    </Box>
  );
};

export default CustomCardForm;

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import { typeScale, tabularNums } from '../../theme';
import { formatMoney } from './ExpenseFeed';

export interface ScannedItem {
  line_no: number;
  item_name: string;
  line_total: number;
  quantity?: number | null;
  unit_price?: number | null;
  normalized_name?: string;
}

interface ScannedItemsCardProps {
  items: ScannedItem[];
  onChange: (items: ScannedItem[]) => void;
  merchant?: string | null;
  tax?: number;
  discount?: number;
  /** QuickCaptureSheet's editable top amount — used only to flag drift in the footer
   * caption below, never to block saving (mirrors AddExpenseForm's non-blocking
   * reconcileOk() caption for the same reason: a receipt total the user tweaks by a
   * few cents shouldn't stop them from logging the expense). */
  currentAmount: number;
}

/**
 * Price field for one scanned item. Deliberately not a plain controlled InputBase bound
 * to `item.line_total` — coercing the text to a Number() on every keystroke drops a
 * trailing "." the instant it's typed (Number("5.") === 5, which redisplays as "5"), so
 * typing "5.98" collapses to "598" one keystroke later. Keeping a local draft string
 * while focused lets the user type a decimal normally; onCommit still pushes numeric
 * updates up on every valid keystroke so the reconciliation footer stays live.
 */
const ItemPriceField: React.FC<{ value: number; onCommit: (n: number) => void }> = ({ value, onCommit }) => {
  const [text, setText] = React.useState(String(value));
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <InputBase
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        const n = Number(text.replace(/[^0-9.-]/g, '')) || 0;
        setText(String(n));
        onCommit(n);
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.-]/g, '');
        setText(v);
        const n = Number(v);
        if (v !== '' && v !== '-' && !Number.isNaN(n)) onCommit(n);
      }}
      startAdornment={
        <Typography component="span" sx={{ fontSize: 13.5, color: 'text.secondary', mr: 0.25 }}>$</Typography>
      }
      inputProps={{ style: { textAlign: 'right' }, inputMode: 'decimal' }}
      sx={{ width: 68, fontSize: 13.5, ...tabularNums }}
    />
  );
};

/**
 * Review surface for a scanned receipt's line items. QuickCaptureSheet's scan button
 * already parsed items via useReceiptScan, but nothing rendered them and save discarded
 * them (addExpense/createGroupExpense only ever took the header total) — this renders
 * inline right where the scan result lands so review-then-save stays a single sheet
 * instead of a separate screen, and feeds edited items back to the itemized save path.
 */
const ScannedItemsCard: React.FC<ScannedItemsCardProps> = ({
  items,
  onChange,
  merchant,
  tax = 0,
  discount = 0,
  currentAmount,
}) => {
  const [expanded, setExpanded] = React.useState(true);

  const subtotal = items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
  const computedTotal = subtotal + tax - discount;
  const delta = computedTotal - currentAmount;
  const reconciled = Math.abs(delta) <= 0.02;

  const updateItem = (lineNo: number, patch: Partial<ScannedItem>) => {
    onChange(items.map((it) => (it.line_no === lineNo ? { ...it, ...patch } : it)));
  };

  const removeItem = (lineNo: number) => {
    onChange(items.filter((it) => it.line_no !== lineNo));
  };

  const addItem = () => {
    const nextLineNo = items.reduce((max, it) => Math.max(max, it.line_no), 0) + 1;
    onChange([...items, { line_no: nextLineNo, item_name: '', line_total: 0 }]);
  };

  return (
    <Box sx={{ mt: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
      <Box
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, cursor: 'pointer', bgcolor: 'action.hover' }}
      >
        <ReceiptLongRoundedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
          {items.length} item{items.length === 1 ? '' : 's'} scanned{merchant ? ` · ${merchant}` : ''}
        </Typography>
        <Typography component="span" sx={{ ...typeScale.amount, color: 'text.secondary' }}>
          {formatMoney(subtotal)}
        </Typography>
        <ExpandMoreRoundedIcon
          fontSize="small"
          sx={{ color: 'text.secondary', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </Box>

      {expanded && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Box sx={{ maxHeight: 190, overflowY: 'auto', pr: 0.5 }}>
            {items.map((item) => (
              <Box key={item.line_no} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5 }}>
                <InputBase
                  value={item.item_name}
                  onChange={(e) => updateItem(item.line_no, { item_name: e.target.value })}
                  placeholder="Item name"
                  sx={{ flex: 1, fontSize: 13.5, minWidth: 0 }}
                />
                <ItemPriceField
                  value={item.line_total}
                  onCommit={(n) => updateItem(item.line_no, { line_total: n })}
                />
                <IconButton size="small" onClick={() => removeItem(item.line_no)} aria-label="Remove item" sx={{ p: 0.5 }}>
                  <CloseRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ))}
          </Box>

          <Box
            onClick={addItem}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addItem(); }}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, py: 0.5, cursor: 'pointer', color: 'primary.main', fontSize: 13, fontWeight: 600 }}
          >
            <AddRoundedIcon sx={{ fontSize: 16 }} /> Add item
          </Box>

          {(tax > 0 || discount > 0) && (
            <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {tax > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Tax</Typography>
                  <Typography variant="caption" color="text.secondary" sx={tabularNums}>{formatMoney(tax)}</Typography>
                </Box>
              )}
              {discount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Discount</Typography>
                  <Typography variant="caption" color="text.secondary" sx={tabularNums}>-{formatMoney(discount)}</Typography>
                </Box>
              )}
            </Box>
          )}

          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 0.75, textAlign: 'right', color: reconciled ? 'success.main' : 'warning.main' }}
          >
            {reconciled ? 'Matches total' : `Items total ${formatMoney(computedTotal)} — off by ${formatMoney(Math.abs(delta))}`}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ScannedItemsCard;

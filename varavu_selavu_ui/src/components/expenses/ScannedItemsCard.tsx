import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import Tooltip from '@mui/material/Tooltip';
import { typeScale, tabularNums } from '../../theme';
import { formatMoney } from './ExpenseFeed';
import { currencySymbol } from '../../utils/money';
import { suggestItems } from '../../api/entityResolution';
import { useEntityResolutionEnabled } from '../../hooks/useEntityResolutionEnabled';
import EntityAutocomplete from './EntityAutocomplete';
import { ReceiptLine, ReceiptReviewLine, lineDiscount, receiptTotals } from '../../utils/receiptLines';

/** A receipt line being reviewed: `line_total` is the paid price (TS-FIX-102). */
export type ScannedItem = ReceiptLine;

interface ScannedItemsCardProps {
  items: ScannedItem[];
  onChange: (items: ScannedItem[]) => void;
  merchant?: string | null;
  tax?: number;
  tip?: number;
  /** The expense's amount. Paid prices + tax + tip must match it within 0.02; the caller blocks
   * Save until they do (`receiptTotals(...).reconciled`), and the footer says by how much. */
  currentAmount: number;
  currency?: string;
  /** Returns/refunds the scanner left out of the items, for the person to account for. */
  review?: ReceiptReviewLine[];
  /** The receipt was saved in the old discount format and its prices were adjusted for checking. */
  legacyFormat?: boolean;
  /** id for the totals status line, so the caller's Save button can point at it (aria-describedby). */
  statusId?: string;
}

/**
 * Price field for one scanned item. Deliberately not a plain controlled InputBase bound
 * to `item.line_total` — coercing the text to a Number() on every keystroke drops a
 * trailing "." the instant it's typed (Number("5.") === 5, which redisplays as "5"), so
 * typing "5.98" collapses to "598" one keystroke later. Keeping a local draft string
 * while focused lets the user type a decimal normally; onCommit still pushes numeric
 * updates up on every valid keystroke so the reconciliation footer stays live.
 */
const ItemPriceField: React.FC<{ value: number | null; onCommit: (n: number | null) => void; currency?: string; label: string; allowEmpty?: boolean }> = ({ value, onCommit, currency = 'USD', label, allowEmpty = false }) => {
  const [text, setText] = React.useState(value == null ? '' : String(value));
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);

  return (
    <InputBase
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (allowEmpty && text.trim() === '') { onCommit(null); return; }
        // No minus values on receipts (TS-FIX-101/102): the minus sign isn't accepted at all.
        const n = Number(text.replace(/[^0-9.]/g, '')) || 0;
        setText(String(n));
        onCommit(n);
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.]/g, '');
        setText(v);
        const n = Number(v);
        if (v === '' && allowEmpty) onCommit(null);
        else if (v !== '' && !Number.isNaN(n)) onCommit(n);
      }}
      startAdornment={
        <Typography component="span" sx={{ fontSize: 13.5, color: 'text.secondary', mr: 0.25 }}>{currencySymbol(currency)}</Typography>
      }
      inputProps={{ style: { textAlign: 'right' }, inputMode: 'decimal', 'aria-label': label }}
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
  tip = 0,
  currentAmount,
  currency = 'USD',
  review = [],
  legacyFormat = false,
  statusId,
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const fetchItemSuggestions = React.useCallback(
    (q: string) => (entityResolutionEnabled ? suggestItems(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const { subtotal, computed: computedTotal, delta, savings, reconciled } = receiptTotals(items, tax, tip, currentAmount);
  const [originalOpen, setOriginalOpen] = React.useState<Record<number, boolean>>({});

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
    // flexShrink 0: the desktop dialog paper is a flex column, and with overflow:hidden this card's
    // min-height is 0 — so once the dialog outgrew the window it was the item that shrank,
    // collapsing to its border and hiding every scanned line (TS-QA-101).
    <Box sx={{ mt: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', flexShrink: 0 }}>
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
          {formatMoney(subtotal, currency)}
        </Typography>
        <ExpandMoreRoundedIcon
          fontSize="small"
          sx={{ color: 'text.secondary', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </Box>

      {expanded && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Box sx={{ maxHeight: 190, overflowY: 'auto', pr: 0.5 }}>
            {items.map((item) => {
              const saved = lineDiscount(item);
              const showOriginal = originalOpen[item.line_no] ?? saved > 0;
              const name = item.item_name || 'item';
              return (
              <Box key={item.line_no} sx={{ py: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <EntityAutocomplete
                    value={item.item_name}
                    onValueChange={(v) => updateItem(item.line_no, { item_name: v })}
                    fetchSuggestions={fetchItemSuggestions}
                    textFieldProps={{
                      variant: 'standard',
                      placeholder: 'Item name',
                      InputProps: { disableUnderline: true, sx: { fontSize: 13.5 } },
                    }}
                  />
                </Box>
                <ItemPriceField
                  value={item.line_total}
                  label={`Price paid for ${name}`}
                  onCommit={(n) => updateItem(item.line_no, { line_total: n ?? 0 })}
                  currency={currency}
                />
                <Tooltip title="Original price and saving">
                  <IconButton
                    size="small"
                    onClick={() => setOriginalOpen((o) => ({ ...o, [item.line_no]: !showOriginal }))}
                    aria-label={showOriginal ? `Hide original price for ${name}` : `Add original price for ${name}`}
                    aria-expanded={showOriginal}
                    sx={{ minWidth: 32, minHeight: 32, fontSize: 13, fontWeight: 700, color: saved > 0 ? 'success.main' : 'text.secondary' }}
                  >
                    %
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={() => removeItem(item.line_no)} aria-label={`Remove ${name}`} sx={{ minWidth: 32, minHeight: 32 }}>
                  <CloseRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
              {showOriginal && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, pr: 6 }}>
                  <Typography variant="caption" color="text.secondary">Original price</Typography>
                  <ItemPriceField
                    value={item.original_price ?? null}
                    allowEmpty
                    label={`Original price for ${name}`}
                    onCommit={(n) => updateItem(item.line_no, { original_price: n, discount: n == null ? 0 : Math.max(0, n - item.line_total) })}
                    currency={currency}
                  />
                  {saved > 0 && (
                    <Typography variant="caption" sx={{ color: 'success.main', ...tabularNums }}>
                      saved {formatMoney(saved, currency)}
                    </Typography>
                  )}
                </Box>
              )}
              </Box>
              );
            })}
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

          {(tax > 0 || tip > 0 || savings > 0) && (
            <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {tax > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Tax</Typography>
                  <Typography variant="caption" color="text.secondary" sx={tabularNums}>{formatMoney(tax, currency)}</Typography>
                </Box>
              )}
              {tip > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Tip</Typography>
                  <Typography variant="caption" color="text.secondary" sx={tabularNums}>{formatMoney(tip, currency)}</Typography>
                </Box>
              )}
              {savings > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  {/* Already included in the prices above: a record, not subtracted again. */}
                  <Typography variant="caption" color="text.secondary">You saved (already in prices)</Typography>
                  <Typography variant="caption" sx={{ color: 'success.main', ...tabularNums }}>{formatMoney(savings, currency)}</Typography>
                </Box>
              )}
            </Box>
          )}

          {review.length > 0 && (
            <Box sx={{ mt: 0.75, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>Not included: returns or refunds</Typography>
              {review.map((r, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>{r.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={tabularNums}>{formatMoney(r.amount, currency)}</Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Adjust the prices or the total so they match.
              </Typography>
            </Box>
          )}

          {legacyFormat && (
            <Typography variant="caption" role="note" sx={{ display: 'block', mt: 0.75, color: 'warning.main' }}>
              Prices were adjusted for discounts. Check them before saving.
            </Typography>
          )}

          <Typography
            variant="caption"
            role="status"
            id={statusId}
            sx={{ display: 'block', mt: 0.75, textAlign: 'right', color: reconciled ? 'success.main' : 'warning.main' }}
          >
            {reconciled
              ? 'Matches total'
              : `Items${tax > 0 || tip > 0 ? ' plus tax and tip' : ''} come to ${formatMoney(computedTotal, currency)}, ${formatMoney(Math.abs(delta), currency)} ${delta > 0 ? 'more' : 'less'} than the total. Make them match to save.`}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ScannedItemsCard;

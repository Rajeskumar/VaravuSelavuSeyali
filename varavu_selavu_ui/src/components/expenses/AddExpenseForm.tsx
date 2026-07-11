import React, { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CircularProgress from '@mui/material/CircularProgress';
import { keyframes } from '@mui/system';
import heic2any from 'heic2any';
import {
  addExpense,
  updateExpense,
  parseReceipt,
  addExpenseWithItems,
  suggestCategory,
  ExpenseRecord,
  AddExpensePayload,
} from '../../api/expenses';
import { isoToMMDDYYYY, mmddyyyyToISO } from '../../utils/date';
import { upsertRecurringTemplate, listRecurringTemplates } from '../../api/recurring';
import { FormControlLabel, Switch, InputAdornment } from '@mui/material';
import {
  GroupSummary,
  GroupDetailResponse,
  PayerSummaryItem,
  GroupExpenseItemEntry,
  listGroups,
  getGroup,
  createGroupExpense,
  createGroupExpenseWithItems,
  ApiError,
} from '../../api/groups';
import { useGroupsEnabled } from '../../hooks/useGroupsEnabled';
import PayerPicker from '../groups/PayerPicker';
import ItemSplitBoard from '../groups/ItemSplitBoard';
import SplitEditor, { SplitEditorEntry } from '../groups/SplitEditor';
import SegmentedTabs from '../common/SegmentedTabs';

// Exported for reuse by the ExpenseFeed/ExpenseDetailSheet (TS-DES-102) — the
// feed's category tint-dot mapping and the detail sheet's inline category
// editor both key off these same main-category names rather than maintaining
// a second category taxonomy.
export const CATEGORY_GROUPS: Record<string, string[]> = {
  Home: ['Rent', 'Electronics', 'Furniture', 'Household supplies', 'Maintenance', 'Mortgage', 'Other', 'Pets', 'Services'],
  Transportation: ['Gas/fuel', 'Car', 'Parking', 'Plane', 'Other', 'Bicycle', 'Bus/Train', 'Taxi', 'Hotel'],
  'Food & Drink': ['Groceries', 'Dining out', 'Liquor', 'Other'],
  Entertainment: ['Movies', 'Other', 'Games', 'Music', 'Sports'],
  Life: ['Medical expenses', 'Insurance', 'Taxes', 'Education', 'Childcare', 'Clothing', 'Gifts', 'Other'],
  Other: ['Services', 'General', 'Electronics'],
  Utilities: ['Heat/gas', 'Electricity', 'Water', 'Other', 'Cleaning', 'Trash', 'Other', 'TV/Phone/Internet'],
};

export const findMainCategory = (sub: string): string => {
  return (
    Object.keys(CATEGORY_GROUPS).find(m => CATEGORY_GROUPS[m].includes(sub)) ||
    Object.keys(CATEGORY_GROUPS)[0]
  );
};

/** Short "Jul 8" (year only when it differs from the current one) — fits the compact date row's
 * half-width column, unlike "07/08/2026". */
function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const includeYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: includeYear ? 'numeric' : undefined });
}

interface AddExpenseFormProps {
  existing?: ExpenseRecord | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onError?: (message: string) => void;
}

/**
 * Compact "tap to edit" row (feedback: forms with every field always fully expanded require too
 * much scrolling on mobile). Shows a single-line label + current value; the field itself renders
 * only while `active`, so auto-populated values (merchant, category, date) stay out of the way
 * until the user actually wants to change them.
 */
function CompactRow({
  label,
  value,
  active,
  onActivate,
  children,
}: {
  label: string;
  value: React.ReactNode;
  active: boolean;
  onActivate: (target: HTMLElement) => void;
  children: React.ReactNode;
}) {
  if (active) return <>{children}</>;
  return (
    <Box
      onClick={(e) => onActivate(e.currentTarget)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(e.currentTarget); }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 1,
        borderRadius: 1,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {value}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </Box>
  );
}

const AddExpenseForm: React.FC<AddExpenseFormProps> = ({ existing = null, onSuccess, onCancel, onError }) => {
  const defaultMain = Object.keys(CATEGORY_GROUPS)[0];
  const initialSub = existing ? existing.category : CATEGORY_GROUPS[defaultMain][0];
  const initialMain = existing ? findMainCategory(initialSub) : defaultMain;
  const [expenseDate, setExpenseDate] = useState(existing ? mmddyyyyToISO(existing.date) : new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(existing?.description || '');
  const [cost, setCost] = useState(existing?.cost || 0);
  const [merchantName, setMerchantName] = useState(existing?.merchant_name || '');
  const [userPickedMerchant, setUserPickedMerchant] = useState(!!existing?.merchant_name);
  const [mainCategory, setMainCategory] = useState(initialMain);
  const [subcategory, setSubcategory] = useState(initialSub);
  const [userPickedCategory, setUserPickedCategory] = useState(!!existing);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [repeatDay, setRepeatDay] = useState<number>(new Date().getDate());
  const typingRef = useRef<NodeJS.Timeout | null>(null);

  // Compact "tap to edit" state (feedback: auto-populated fields shouldn't sit fully expanded
  // by default) — merchant/date collapse to a label until tapped; category opens a picker menu.
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [categoryMenuAnchor, setCategoryMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickerMain, setPickerMain] = useState(initialMain);

  // Personal/Group toggle (spec §10.1/§11.2) — only offered on fresh creates;
  // editing an existing (always-personal) expense never shows this.
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const [mode, setMode] = useState<'personal' | 'group'>('personal');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupDetail, setGroupDetail] = useState<GroupDetailResponse | null>(null);
  const [payers, setPayers] = useState<PayerSummaryItem[]>([]);
  const [payersValid, setPayersValid] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitEditorEntry[]>([]);
  const [splitValid, setSplitValid] = useState(false);
  const [groupItems, setGroupItems] = useState<GroupExpenseItemEntry[]>([]);
  const [groupItemsValid, setGroupItemsValid] = useState(false);
  const [groupSubmitError, setGroupSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupsEnabled || existing) return;
    let mounted = true;
    (async () => {
      try {
        const g = await listGroups();
        if (mounted) setGroups(g);
      } catch {
        if (mounted) setGroups([]);
      }
    })();
    return () => { mounted = false; };
  }, [groupsEnabled, existing]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupDetail(null);
      setPayers([]);
      setSplitEntries([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const grp = await getGroup(selectedGroupId);
        if (!mounted) return;
        setGroupDetail(grp);
        if (selectedGroupId && grp) {
          const myEmail = localStorage.getItem('vs_user');
          const myMember = grp.members.find(m => m.user_email === myEmail);
          if (myMember) {
            setPayers([{ member_id: myMember.member_id, amount_paid: cost }]);
          }
          setSplitEntries(grp.members.map((m) => ({ member_id: m.member_id })));
        }
      } catch {
        if (mounted) {
          setGroupDetail(null);
          setPayers([]);
          setSplitEntries([]);
        }
      }
    })();
    return () => { mounted = false; };
  }, [selectedGroupId, cost]);

  const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  `;

  // OpenAI only accepts PNG or JPEG. Any other image format (e.g., HEIC) must
  // be converted in-browser before sending to the backend.
  const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  const fetchCategory = async () => {
    if (!description.trim() || userPickedCategory) return;
    try {
      const res = await suggestCategory(description.trim());
      if (CATEGORY_GROUPS[res.main_category]?.includes(res.subcategory)) {
        setMainCategory(res.main_category);
        setSubcategory(res.subcategory);
      }
      // Auto-populate merchant_name from LLM if user hasn't overridden
      if (!userPickedMerchant && res.merchant_name) {
        setMerchantName(res.merchant_name);
      }
    } catch {
      /* ignore errors */
    }
  };

  const scheduleFetch = () => {
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(fetchCategory, 3000);
  };

  useEffect(() => {
    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, []);

  useEffect(() => {
    if (existing) {
      setExpenseDate(mmddyyyyToISO(existing.date));
      setDescription(existing.description);
      setCost(existing.cost);
      setMerchantName(existing.merchant_name || '');
      setUserPickedMerchant(!!existing.merchant_name);
      const main = findMainCategory(existing.category);
      setMainCategory(main);
      setSubcategory(existing.category);
      setUserPickedCategory(true);
      // load recurring template if any (server-backed)
      (async () => {
        try {
          const tpls = await listRecurringTemplates();
          const tpl = tpls.find(t => t.description === existing.description && t.category === existing.category);
          if (tpl) {
            setRecurring(true);
            setRepeatDay(tpl.day_of_month);
            return;
          }
        } catch {/* ignore */}
        const d = new Date(mmddyyyyToISO(existing.date));
        setRepeatDay(d.getDate());
      })();
    }
  }, [existing]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
        setMessage('Unsupported file type');
        setFile(null);
        return;
      }
      setConverting(true);
      let processed = f;
      if (f.type.startsWith('image/') && !SUPPORTED_IMAGE_TYPES.includes(f.type)) {
        try {
          // First handle HEIC explicitly via the heic2any library.  This avoids
          // relying on createImageBitmap, which many browsers do not support
          // for HEIC images captured on iOS devices.
          if (f.type === 'image/heic' || f.name.toLowerCase().endsWith('.heic')) {
            const heicBlob = await heic2any({ blob: f, toType: 'image/png' });
            processed = new File([heicBlob], f.name.replace(/\.[^.]+$/, '.png'), {
              type: 'image/png',
            });
          } else {
            const img = await createImageBitmap(f);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
            if (blob) {
              processed = new File([blob], f.name.replace(/\.[^.]+$/, '.png'), {
                type: 'image/png',
              });
            } else {
              setMessage('Failed to process image');
              setConverting(false);
              return;
            }
          }
        } catch {
          setMessage('Unsupported image format');
          setConverting(false);
          return;
        }
      }
      setFile(processed);
      setConverting(false);
      // Auto-parse when capturing from camera
      if (e.target === cameraInputRef.current) {
        await handleParse(processed);
      }
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDescription(val);
    setUserPickedCategory(false);
    // Reset auto-merchant when description changes (unless user has manually set it)
    if (!userPickedMerchant) setMerchantName('');
    if (draft) setDraft({ ...draft, header: { ...draft.header, description: val } });
    scheduleFetch();
  };

  const handleDescriptionBlur = () => {
    if (typingRef.current) {
      clearTimeout(typingRef.current);
      typingRef.current = null;
    }
    fetchCategory();
  };

  const handleParse = async (f?: File) => {
    const target = f || file;
    if (!target) return;
    try {
      setParsing(true);
      const res = await parseReceipt(target);
      const hdr = res.header || {};
      const sub = hdr.category_name || '';
      const main = hdr.main_category_name || findMainCategory(sub);

      let desc = hdr.description || '';
      const merchant = hdr.merchant_name || hdr.merchant || '';
      if (!desc) {
        if (sub === 'Dining out' && hdr.purchased_at) {
          const hour = new Date(hdr.purchased_at).getHours();
          const meal = hour >= 17 ? 'Dinner' : hour >= 11 ? 'Lunch' : 'Breakfast';
          desc = `${meal} at ${merchant || 'restaurant'}`;
        } else {
          desc = merchant;
        }
      }

      const processed = {
        ...res,
        header: { ...res.header, description: desc, main_category_name: main, category_name: sub || CATEGORY_GROUPS[main][0] },
      };
      setDraft(processed);
      setCost(Number(res.header.amount) || 0);
      setGroupItems((res.items || []).map((i: any, idx: number) => ({
        line_no: idx + 1,
        item_name: i.item_name,
        line_total: Number(i.line_total) || 0,
        quantity: Number(i.quantity) || null,
        unit_price: Number(i.unit_price) || null,
        member_ratios: {},
      })));
      setMessage('Receipt parsed successfully. Review details below.');
      setDescription(desc);
      // Populate merchant from receipt header if user hasn't manually typed one
      if (!userPickedMerchant && (hdr.merchant_name || hdr.merchant)) {
        setMerchantName(hdr.merchant_name || hdr.merchant || '');
      }
      if (hdr.purchased_at) setExpenseDate(hdr.purchased_at.split('T')[0]);
      setMainCategory(main);
      if (sub && CATEGORY_GROUPS[main].includes(sub)) setSubcategory(sub); else setSubcategory(CATEGORY_GROUPS[main][0]);
    } catch (e) {
      setMessage('Failed to parse receipt');
    } finally {
      setParsing(false);
    }
  };

  const reconcileDelta = () => {
    if (!draft) return 0;
    const subtotal = draft.items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
    const { tax = 0, tip = 0, discount = 0 } = draft.header;
    return subtotal + tax + tip - discount - cost;
  };

  const reconcileOk = () => Math.abs(reconcileDelta()) <= 0.02;

  const saveDisabled = () => {
    const requiredFilled =
      description.trim() !== '' && cost > 0 && expenseDate && subcategory && mainCategory;
    if (mode === 'group' && !existing) {
      if (draft && draft.items.length > 0) {
        return saving || parsing || converting || !requiredFilled || !selectedGroupId || !payersValid || !groupItemsValid;
      }
      return saving || parsing || converting || !requiredFilled || !selectedGroupId || !payersValid || !splitValid;
    }
    return (
      saving || parsing || converting || !requiredFilled
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const user = localStorage.getItem('vs_user');
    if (!user) {
      setMessage('Please login first.');
      return;
    }
    try {
      setSaving(true);
      const formattedDate = isoToMMDDYYYY(expenseDate);
      if (mode === 'group' && !existing) {
        setGroupSubmitError(null);
        try {
          if (draft && draft.items.length > 0) {
            await createGroupExpenseWithItems(selectedGroupId, {
              date: formattedDate,
              description,
              category: subcategory,
              amount: cost,
              merchant_name: merchantName || undefined,
              payers,
              items: groupItems,
            });
          } else {
            await createGroupExpense(selectedGroupId, {
              date: formattedDate,
              description,
              category: subcategory,
              amount: cost,
              merchant_name: merchantName || undefined,
              payers,
              split: { type: 'equal', entries: splitEntries },
            });
          }
          setMessage('Group expense added successfully.');
          setDescription('');
          setCost(0);
          setDraft(null);
          setFile(null);
          onSuccess?.();
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : 'Failed to add group expense.';
          // Surface 409 duplicate receipt inline just like personal expenses
          if (err instanceof ApiError && err.status === 409) {
            setGroupSubmitError(msg);
          } else {
            setGroupSubmitError(msg);
          }
          onError?.(msg);
        }
        return;
      }
      if (existing) {
        const payload: AddExpensePayload = {
          user_id: user,
          date: formattedDate,
          description,
          category: subcategory,
          cost,
          merchant_name: merchantName || undefined,
        };
        await updateExpense(existing.row_id, payload);
        setMessage('Expense updated successfully.');
        if (recurring) {
          await upsertRecurringTemplate({
            description,
            category: subcategory,
            day_of_month: repeatDay,
            default_cost: cost,
            start_date_iso: mmddyyyyToISO(existing.date),
          });
        }
      } else if (draft && draft.items.length > 0) {
        const payload = {
          user_email: user,
          header: {
            ...draft.header,
            amount: cost,
            description,
            category_name: subcategory,
            main_category_name: mainCategory,
            purchased_at: formattedDate,
            fingerprint: draft.fingerprint,
            merchant_name: merchantName || undefined,
          },
          items: draft.items.map((i: any) => ({ ...i })),
        };
        await addExpenseWithItems(payload);
      } else {
        await addExpense({
          user_id: user,
          date: formattedDate,
          description,
          category: subcategory,
          cost,
          merchant_name: merchantName || undefined,
        });
        setMessage('Expense added successfully.');
        if (recurring) {
          await upsertRecurringTemplate({
            description,
            category: subcategory,
            day_of_month: repeatDay,
            default_cost: cost,
            start_date_iso: expenseDate,
          });
        }
        setDescription('');
        setCost(0);
        setDraft(null);
        setFile(null);
      }
      onSuccess?.();
    } catch (err) {
      const msg = existing ? 'Failed to update expense.' : 'Failed to add expense.';
      setMessage(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Compact pass: this is always rendered nested inside a Dialog (MainLayout's FAB dialog,
    // ExpensesPage's Add Expense dialog) whose Paper already provides the card surface/border
    // — a second bordered `Card` here just doubled the chrome and padding, pushing the popup
    // taller than it needed to be. Plain `Box` now; standalone (test-only) usage is unaffected
    // since a bare form with no card framing still renders/behaves the same.
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {existing ? 'Edit Expense' : 'Add Expense'}
          </Typography>
          {onCancel && (
            <IconButton aria-label="close" onClick={onCancel} size="small">
              <CloseIcon />
            </IconButton>
          )}
        </Box>
        <Divider sx={{ mb: 1.5 }} />
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <Grid container spacing={1.5}>
            {/* Primary details */}
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label="Description"
                value={description}
                
                onChange={handleDescriptionChange}
                onBlur={handleDescriptionBlur}
                placeholder="e.g., Electricity bill, Grocery at Costco"
                required
              />
            </Grid>
            {groupsEnabled && !existing && (
              <Grid size={12}>
                <SegmentedTabs
                  value={mode}
                  onChange={setMode}
                  ariaLabel="Personal or group expense"
                  options={[
                    { value: 'personal', label: 'Personal' },
                    { value: 'group', label: 'Group' },
                  ]}
                />
              </Grid>
            )}
            {mode === 'group' && !existing && (
              <>
                <Grid size={12}>
                  <TextField
                    select
                    fullWidth
                    label="Group"
                    value={selectedGroupId}
                    
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    required
                  >
                    {groups.map((g) => (
                      <MenuItem key={g.group_id} value={g.group_id}>{g.name}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                {groupDetail && (
                  <>
                    <Grid size={12}>
                      <Divider sx={{ my: 1 }} />
                      <PayerPicker
                        amount={cost}
                        members={groupDetail.members}
                        payers={payers}
                        onChange={setPayers}
                        onValidityChange={setPayersValid}
                      />
                    </Grid>
                    <Grid size={12}>
                      <Divider sx={{ my: 1 }} />
                      {draft && draft.items.length > 0 ? (
                        <>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Split Items
                          </Typography>
                          <ItemSplitBoard
                            items={groupItems}
                            members={groupDetail.members}
                            onChange={setGroupItems}
                            onValidityChange={setGroupItemsValid}
                            groupId={groupDetail.group_id}
                          />
                        </>
                      ) : (
                        <>
                          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                            Split equally among
                          </Typography>
                          <SplitEditor
                            amount={cost}
                            members={groupDetail.members}
                            value={{ type: 'equal', entries: splitEntries }}
                            onChange={(v) => setSplitEntries(v.entries)}
                            onValidityChange={setSplitValid}
                            allowedTypes={['equal']}
                            serverError={groupSubmitError}
                          />
                        </>
                      )}
                    </Grid>
                  </>
                )}
              </>
            )}
            <Grid size={12}>
              <CompactRow
                label="Merchant"
                value={merchantName || 'Add merchant'}
                active={editingMerchant}
                onActivate={() => setEditingMerchant(true)}
              >
                <TextField
                  fullWidth
                  autoFocus
                  size="small"
                  label="Merchant / Store Name"
                  value={merchantName}
                  
                  onChange={(e) => {
                    setMerchantName(e.target.value);
                    setUserPickedMerchant(true);
                  }}
                  onBlur={() => setEditingMerchant(false)}
                  placeholder="e.g., Starbucks, Amazon, PG&E"
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    endAdornment: !userPickedMerchant && merchantName ? (
                      <InputAdornment position="end">
                        <span title="Auto-suggested" style={{ fontSize: 16 }}>✨</span>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </CompactRow>
            </Grid>
            <Grid size={6}>
              <CompactRow
                label="Date"
                value={formatShortDate(expenseDate)}
                active={editingDate}
                onActivate={() => setEditingDate(true)}
              >
                <TextField
                  fullWidth
                  autoFocus
                  size="small"
                  label="Date"
                  type="date"
                  value={expenseDate}
                  
                  onChange={e => {
                    const iso = e.target.value;
                    setExpenseDate(iso);
                    if (draft) setDraft({ ...draft, header: { ...draft.header, purchased_at: isoToMMDDYYYY(iso) } });
                    const d = new Date(iso);
                    if (!isNaN(d.getTime())) setRepeatDay(d.getDate());
                  }}
                  onBlur={() => setEditingDate(false)}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </CompactRow>
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Cost"
                type="number"
                value={cost}
                
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setCost(val);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, amount: val } });
                }}
                required
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              />
            </Grid>
            {/* Recurring toggle — personal only; group recurring templates are Phase 2 (spec §11.2 RecurringPage). */}
            {mode === 'personal' && (
            <Grid size={12}>
              <FormControlLabel
                control={<Switch checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />}
                label="Repeat monthly"
              />
              {recurring && (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
                  <TextField
                    label="Repeat on day"
                    type="number"
                    value={repeatDay}
                    onChange={e => setRepeatDay(Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))))}
                    size="small"
                    sx={{ width: 160 }}
                    helperText="We’ll prompt you on this day each month"
                    inputProps={{ min: 1, max: 31 }}
                  />
                  <Typography variant="caption" color="text.secondary">You can adjust the amount each month before confirming.</Typography>
                </Box>
              )}
            </Grid>
            )}
            {/* Category — a single compact row opening a two-level picker menu, rather than two
                always-expanded Main/Subcategory dropdowns (feedback: keep auto-populated fields
                collapsed to a label until the user actually wants to change them). */}
            <Grid size={12}>
              <CompactRow
                label="Category"
                value={`${mainCategory} · ${subcategory}`}
                active={false}
                onActivate={(target) => { setPickerMain(mainCategory); setCategoryMenuAnchor(target); }}
              >
                {null}
              </CompactRow>
              <Menu
                anchorEl={categoryMenuAnchor}
                open={!!categoryMenuAnchor}
                onClose={() => setCategoryMenuAnchor(null)}
              >
                <Box sx={{ px: 1.5, pt: 0.5, pb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 320 }}>
                  {Object.keys(CATEGORY_GROUPS).map((category) => (
                    <Box
                      key={category}
                      onClick={() => setPickerMain(category)}
                      sx={{
                        px: 1.25,
                        py: 0.5,
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        bgcolor: category === pickerMain ? 'primary.main' : 'action.hover',
                        color: category === pickerMain ? 'primary.contrastText' : 'text.primary',
                      }}
                    >
                      {category}
                    </Box>
                  ))}
                </Box>
                <Divider />
                {CATEGORY_GROUPS[pickerMain].map((sub) => (
                  <MenuItem
                    key={sub}
                    selected={pickerMain === mainCategory && sub === subcategory}
                    onClick={() => {
                      setMainCategory(pickerMain);
                      setSubcategory(sub);
                      setUserPickedCategory(true);
                      if (draft) setDraft({ ...draft, header: { ...draft.header, main_category_name: pickerMain, category_name: sub } });
                      setCategoryMenuAnchor(null);
                    }}
                  >
                    {sub}
                  </MenuItem>
                ))}
              </Menu>
            </Grid>
            <Divider sx={{ width: '100%', my: 0.5 }} />
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Upload Receipt
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <input
                  data-testid="file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button  onClick={() => fileInputRef.current?.click()}>
                  Choose File
                </Button>
                {isMobile && (
                  <Button  onClick={() => cameraInputRef.current?.click()}>
                    Take Photo
                  </Button>
                )}
                {converting && <CircularProgress size={20} />}
                <Tooltip title="Upload a receipt image or PDF to pre-fill and itemize this expense">
                  <span>
                    <Button
                      onClick={() => handleParse()}
                      disabled={!file || parsing || converting}
                      startIcon={
                        parsing ? (
                          <ReceiptLongIcon sx={{ animation: `${spin} 1s linear infinite` }} />
                        ) : converting ? (
                          <CircularProgress size={20} />
                        ) : (
                          <UploadFileIcon />
                        )
                      }
                      sx={{ ml: 1 }}
                    >
                      {parsing ? 'Parsing...' : 'Parse Receipt'}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
              {file && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {file.name}
                </Typography>
              )}
            </Grid>
            {/* Itemized receipt editing is personal-only in Phase 1 — group expenses
                are equal-split-on-the-total only (spec §10.1, TS-GRP-104 has no
                itemized group endpoint yet). */}
            {mode === 'personal' && draft && (
              <>
                <Grid size={12}>
                  <Typography variant="subtitle1">Items</Typography>
                </Grid>
                {draft.items.map((item: any, idx: number) => (
                  <Grid key={idx} size={12} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
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
                        const val = e.target.value;
                        items[idx].line_total = val === '-' || val === '' ? val : Number(val);
                        setDraft({ ...draft, items });
                      }}
                    />
                    <TextField
                      label="Category"
                      value={item.category_name || ''}
                      
                      onChange={e => {
                        const items = [...draft.items];
                        items[idx].category_name = e.target.value;
                        setDraft({ ...draft, items });
                      }}
                    />
                    <Button
                      onClick={() => {
                        const items = draft.items.filter((_: any, i: number) => i !== idx);
                        setDraft({ ...draft, items });
                      }}
                    >
                      Delete
                    </Button>
                  </Grid>
                ))}
                <Grid size={12}>
                  <Button
                    onClick={() => {
                      const items = [
                        ...draft.items,
                        {
                          line_no: draft.items.length + 1,
                          item_name: '',
                          line_total: 0,
                          category_name: '',
                        },
                      ];
                      setDraft({ ...draft, items });
                    }}
                  >
                    Add Item
                  </Button>
                </Grid>
                <Grid size={12}>
                  <Typography color={reconcileOk() ? 'green' : 'red'}>
                    {reconcileOk()
                      ? 'Totals match'
                      : `Totals mismatch by $${reconcileDelta().toFixed(2)}`}
                  </Typography>
                </Grid>
              </>
            )}
            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                {onCancel && (
                  <Button onClick={onCancel}>Cancel</Button>
                )}
                <Button type="submit" variant="contained" color="primary" disabled={saveDisabled()}>
                  {saving ? 'Saving...' : existing ? 'Update Expense' : 'Add Expense'}
                </Button>
              </Box>
            </Grid>
            {message && (
              <Grid size={12}>
                <Typography align="center">{message}</Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      </CardContent>
    </Box>
  );
};

export default AddExpenseForm;

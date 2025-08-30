import React, { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
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

const CATEGORY_GROUPS: Record<string, string[]> = {
  Home: ['Rent', 'Electronics', 'Furniture', 'Household supplies', 'Maintenance', 'Mortgage', 'Other', 'Pets', 'Services'],
  Transportation: ['Gas/fuel', 'Car', 'Parking', 'Plane', 'Other', 'Bicycle', 'Bus/Train', 'Taxi', 'Hotel'],
  'Food & Drink': ['Groceries', 'Dining out', 'Liquor', 'Other'],
  Entertainment: ['Movies', 'Other', 'Games', 'Music', 'Sports'],
  Life: ['Medical expenses', 'Insurance', 'Taxes', 'Education', 'Childcare', 'Clothing', 'Gifts', 'Other'],
  Other: ['Services', 'General', 'Electronics'],
  Utilities: ['Heat/gas', 'Electricity', 'Water', 'Other', 'Cleaning', 'Trash', 'Other', 'TV/Phone/Internet'],
};

const findMainCategory = (sub: string): string => {
  return (
    Object.keys(CATEGORY_GROUPS).find(m => CATEGORY_GROUPS[m].includes(sub)) ||
    Object.keys(CATEGORY_GROUPS)[0]
  );
};

interface AddExpenseFormProps {
  existing?: ExpenseRecord | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const AddExpenseForm: React.FC<AddExpenseFormProps> = ({ existing = null, onSuccess, onCancel }) => {
  const defaultMain = Object.keys(CATEGORY_GROUPS)[0];
  const initialSub = existing ? existing.category : CATEGORY_GROUPS[defaultMain][0];
  const initialMain = existing ? findMainCategory(initialSub) : defaultMain;
  const [expenseDate, setExpenseDate] = useState(existing?.date || new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(existing?.description || '');
  const [cost, setCost] = useState(existing?.cost || 0);
  const [mainCategory, setMainCategory] = useState(initialMain);
  const [subcategory, setSubcategory] = useState(initialSub);
  const [userPickedCategory, setUserPickedCategory] = useState(!!existing);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  `;

  const glassFieldSx = {
    '& .MuiInputBase-root': {
      backdropFilter: 'blur(4px)',
      background: 'rgba(255,255,255,0.6)',
    },
  } as const;

  const glassButtonSx = {
    backdropFilter: 'blur(4px)',
    background: 'rgba(255,255,255,0.3)',
    border: '1px solid rgba(255,255,255,0.18)',
  } as const;

  // OpenAI only accepts PNG or JPEG. Any other image format (e.g., HEIC) must
  // be converted in-browser before sending to the backend.
  const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (!description.trim() || userPickedCategory) return;
    const handle = setTimeout(async () => {
      try {
        const res = await suggestCategory(description.trim());
        if (CATEGORY_GROUPS[res.main_category]?.includes(res.subcategory)) {
          setMainCategory(res.main_category);
          setSubcategory(res.subcategory);
        }
      } catch {
        /* ignore errors */
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [description, userPickedCategory]);

  useEffect(() => {
    if (existing) {
      setExpenseDate(existing.date);
      setDescription(existing.description);
      setCost(existing.cost);
      const main = findMainCategory(existing.category);
      setMainCategory(main);
      setSubcategory(existing.category);
      setUserPickedCategory(true);
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

  const handleMainCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMain = e.target.value;
    setMainCategory(newMain);
    setSubcategory(CATEGORY_GROUPS[newMain][0]);
    setUserPickedCategory(true);
    if (draft) {
      setDraft({ ...draft, header: { ...draft.header, main_category_name: newMain, category_name: CATEGORY_GROUPS[newMain][0] } });
    }
  };

  const handleSubcategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sub = e.target.value;
    setSubcategory(sub);
    setUserPickedCategory(true);
    if (draft) setDraft({ ...draft, header: { ...draft.header, category_name: sub } });
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
      setCost(hdr.amount || 0);
      setDescription(desc);
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
    const subtotal = draft.items.reduce((s: number, it: any) => s + (it.line_total || 0), 0);
    const { tax = 0, tip = 0, discount = 0 } = draft.header;
    return subtotal + tax + tip - discount - cost;
  };

  const reconcileOk = () => Math.abs(reconcileDelta()) <= 0.02;

  const saveDisabled = () => {
    const requiredFilled =
      description.trim() !== '' && cost > 0 && expenseDate && subcategory && mainCategory;
    return (
      saving || parsing || converting || !requiredFilled || (draft ? !reconcileOk() : false)
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
      if (existing) {
        const payload: AddExpensePayload = {
          user_id: user,
          date: expenseDate,
          description,
          category: subcategory,
          cost,
        };
        await updateExpense(existing.row_id, payload);
        setMessage('Expense updated successfully.');
      } else if (draft && draft.items.length > 0) {
        const payload = {
          user_email: user,
          header: {
            ...draft.header,
            amount: cost,
            description,
            category_name: subcategory,
            main_category_name: mainCategory,
            purchased_at: expenseDate,
            fingerprint: draft.fingerprint,
          },
          items: draft.items.map((i: any) => ({ ...i })),
        };
        await addExpenseWithItems(payload);
      } else {
        await addExpense({
          user_id: user,
          date: expenseDate,
          description,
          category: subcategory,
          cost,
        });
        setMessage('Expense added successfully.');
        setDescription('');
        setCost(0);
        setDraft(null);
        setFile(null);
      }
      onSuccess?.();
    } catch (err) {
      setMessage('Failed to add expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      sx={{
        maxWidth: 600,
        mx: 'auto',
        mt: 2,
        p: 2,
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(31,38,135,0.37)',
        border: '1px solid rgba(255,255,255,0.18)',
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Add New Expense
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={expenseDate}
                sx={glassFieldSx}
                onChange={e => {
                  setExpenseDate(e.target.value);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, purchased_at: e.target.value } });
                }}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Cost (USD)"
                type="number"
                value={cost}
                sx={glassFieldSx}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setCost(val);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, amount: val } });
                }}
                required
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Description"
                value={description}
                sx={glassFieldSx}
                onChange={e => {
                  setDescription(e.target.value);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, description: e.target.value } });
                }}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                select
                fullWidth
                label="Main Category"
                value={mainCategory}
                sx={glassFieldSx}
                onChange={handleMainCategoryChange}
              >
                {Object.keys(CATEGORY_GROUPS).map(category => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField
                select
                fullWidth
                label="Subcategory"
                value={subcategory}
                sx={glassFieldSx}
                onChange={handleSubcategoryChange}
              >
                {CATEGORY_GROUPS[mainCategory].map(sub => (
                  <MenuItem key={sub} value={sub}>
                    {sub}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
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
                <Button sx={glassButtonSx} onClick={() => fileInputRef.current?.click()}>
                  Choose File
                </Button>
                {isMobile && (
                  <Button sx={glassButtonSx} onClick={() => cameraInputRef.current?.click()}>
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
            {draft && (
              <>
                <Grid size={12}>
                  <Typography variant="subtitle1">Items</Typography>
                </Grid>
                {draft.items.map((item: any, idx: number) => (
                  <Grid key={idx} size={12} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      label="Name"
                      value={item.item_name}
                      sx={glassFieldSx}
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
                      sx={glassFieldSx}
                      onChange={e => {
                        const items = [...draft.items];
                        items[idx].line_total = parseFloat(e.target.value) || 0;
                        setDraft({ ...draft, items });
                      }}
                    />
                    <TextField
                      label="Category"
                      value={item.category_name || ''}
                      sx={glassFieldSx}
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
              <Button type="submit" variant="contained" color="primary" fullWidth disabled={saveDisabled()}>
                {saving ? 'Saving...' : existing ? 'Update Expense' : 'Add Expense'}
              </Button>
              {onCancel && (
                <Button onClick={onCancel} fullWidth sx={{ mt: 1 }}>
                  Cancel
                </Button>
              )}
            </Grid>
            {message && (
              <Grid size={12}>
                <Typography align="center">{message}</Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AddExpenseForm;

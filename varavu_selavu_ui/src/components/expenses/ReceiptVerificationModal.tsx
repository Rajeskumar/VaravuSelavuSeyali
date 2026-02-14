import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    Typography,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Box,
    Divider,
    MenuItem,
    InputAdornment,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { ReceiptParseDraft } from '../../api/expenses';
import { isoToMMDDYYYY } from '../../utils/date';

interface ReceiptVerificationModalProps {
    open: boolean;
    draft: ReceiptParseDraft | null;
    onClose: () => void;
    onSave: (finalData: any) => void;
    categoryGroups: Record<string, string[]>;
}

const ReceiptVerificationModal: React.FC<ReceiptVerificationModalProps> = ({
    open,
    draft,
    onClose,
    onSave,
    categoryGroups,
}) => {
    // Local state for editing
    const [header, setHeader] = useState<any>({});
    const [items, setItems] = useState<any[]>([]);

    useEffect(() => {
        if (draft && open) {
            setHeader({
                merchant_name: draft.header.merchant_name || '',
                purchased_at: draft.header.purchased_at || new Date().toISOString().split('T')[0],
                amount: draft.header.amount || 0,
                tax: draft.header.tax || 0,
                tip: draft.header.tip || 0,
                discount: draft.header.discount || 0,
                description: draft.header.description || '',
                main_category_name: draft.header.main_category_name || Object.keys(categoryGroups)[0],
                category_name: draft.header.category_name || categoryGroups[Object.keys(categoryGroups)[0]][0],
                fingerprint: draft.fingerprint,
            });
            setItems(draft.items ? draft.items.map(i => ({ ...i })) : []);
        }
    }, [draft, open, categoryGroups]);

    const handleHeaderChange = (field: string, value: any) => {
        setHeader((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        // Auto-calc line total if price/qty changes
        if (field === 'unit_price' || field === 'quantity') {
            const qty = field === 'quantity' ? parseFloat(value) || 0 : newItems[index].quantity || 0;
            const price = field === 'unit_price' ? parseFloat(value) || 0 : newItems[index].unit_price || 0;
            newItems[index].line_total = parseFloat((qty * price).toFixed(2));
        }
        setItems(newItems);
    };

    const handleDeleteItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleAddItem = () => {
        setItems([
            ...items,
            {
                line_no: items.length + 1,
                item_name: '',
                quantity: 1,
                unit_price: 0,
                line_total: 0,
                category_name: header.category_name, // default to main receipt category
            },
        ]);
    };

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (parseFloat(item.line_total) || 0), 0);
    }, [items]);

    const calculatedTotal = useMemo(() => {
        const tax = parseFloat(header.tax) || 0;
        const tip = parseFloat(header.tip) || 0;
        const discount = parseFloat(header.discount) || 0;
        return itemsTotal + tax + tip - discount;
    }, [itemsTotal, header]);

    const diff = useMemo(() => {
        return Math.abs(calculatedTotal - (parseFloat(header.amount) || 0));
    }, [calculatedTotal, header.amount]);

    const isMatched = diff < 0.05; // 5 cent tolerance

    const handleSave = () => {
        // Construct final payload
        const finalPayload = {
            user_email: localStorage.getItem('vs_user') || '',
            header: {
                ...header,
                purchased_at: isoToMMDDYYYY(header.purchased_at), // Convert back to MM/DD/YYYY for backend
            },
            items: items.map(i => ({
                ...i,
                line_total: parseFloat(i.line_total) || 0,
                quantity: parseFloat(i.quantity) || 1,
                unit_price: parseFloat(i.unit_price) || 0,
            })),
        };
        onSave(finalPayload);
    };

    // Flatten categories for item dropdown
    const allSubcategories = useMemo(() => {
        return Object.values(categoryGroups).flat();
    }, [categoryGroups]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>Verify Receipt</DialogTitle>
            <DialogContent dividers>
                <Grid container spacing={2}>
                    {/* Header Section */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                                Receipt Details
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid size={12}>
                                    <TextField
                                        fullWidth
                                        label="Merchant / Description"
                                        value={header.description}
                                        onChange={(e) => handleHeaderChange('description', e.target.value)}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <TextField
                                        fullWidth
                                        label="Date"
                                        type="date"
                                        value={header.purchased_at}
                                        onChange={(e) => handleHeaderChange('purchased_at', e.target.value)}
                                        size="small"
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <TextField
                                        fullWidth
                                        label="Grand Total"
                                        type="number"
                                        value={header.amount}
                                        onChange={(e) => handleHeaderChange('amount', parseFloat(e.target.value))}
                                        size="small"
                                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                        error={!isMatched}
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Tax"
                                        type="number"
                                        value={header.tax}
                                        onChange={(e) => handleHeaderChange('tax', parseFloat(e.target.value))}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Tip"
                                        type="number"
                                        value={header.tip}
                                        onChange={(e) => handleHeaderChange('tip', parseFloat(e.target.value))}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Discount"
                                        type="number"
                                        value={header.discount}
                                        onChange={(e) => handleHeaderChange('discount', parseFloat(e.target.value))}
                                        size="small"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="Main Category"
                                        value={header.main_category_name}
                                        onChange={(e) => {
                                            const main = e.target.value;
                                            handleHeaderChange('main_category_name', main);
                                            handleHeaderChange('category_name', categoryGroups[main][0]);
                                        }}
                                        size="small"
                                    >
                                        {Object.keys(categoryGroups).map((c) => (
                                            <MenuItem key={c} value={c}>{c}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                <Grid size={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="Subcategory"
                                        value={header.category_name}
                                        onChange={(e) => handleHeaderChange('category_name', e.target.value)}
                                        size="small"
                                    >
                                        {categoryGroups[header.main_category_name]?.map((c) => (
                                            <MenuItem key={c} value={c}>{c}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 2, p: 1, bgcolor: isMatched ? '#e8f5e9' : '#ffebee', borderRadius: 1 }}>
                                <Typography variant="body2" color={isMatched ? 'success.main' : 'error.main'}>
                                    Calculated: ${calculatedTotal.toFixed(2)}
                                </Typography>
                                <Typography variant="body2" color={isMatched ? 'success.main' : 'error.main'} sx={{ fontWeight: 'bold' }}>
                                    {isMatched ? 'Matches Total' : `Diff: $${diff.toFixed(2)}`}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>

                    {/* Items Section */}
                    <Grid size={{ xs: 12, md: 8 }}>
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item</TableCell>
                                        <TableCell width={100}>Category</TableCell>
                                        <TableCell width={70} align="right">Qty</TableCell>
                                        <TableCell width={80} align="right">Price</TableCell>
                                        <TableCell width={80} align="right">Total</TableCell>
                                        <TableCell width={50}></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>
                                                <TextField
                                                    fullWidth
                                                    variant="standard"
                                                    value={item.item_name}
                                                    onChange={(e) => handleItemChange(idx, 'item_name', e.target.value)}
                                                    InputProps={{ disableUnderline: true }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    select
                                                    fullWidth
                                                    variant="standard"
                                                    value={item.category_name || ''}
                                                    onChange={(e) => handleItemChange(idx, 'category_name', e.target.value)}
                                                    InputProps={{ disableUnderline: true }}
                                                    SelectProps={{ displayEmpty: true }}
                                                >
                                                    {allSubcategories.map((c) => (
                                                        <MenuItem key={c} value={c}>{c}</MenuItem>
                                                    ))}
                                                </TextField>
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField
                                                    type="number"
                                                    variant="standard"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                    InputProps={{ disableUnderline: true, inputProps: { style: { textAlign: 'right' } } }}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField
                                                    type="number"
                                                    variant="standard"
                                                    value={item.unit_price}
                                                    onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                                                    InputProps={{ disableUnderline: true, inputProps: { style: { textAlign: 'right' } } }}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField
                                                    type="number"
                                                    variant="standard"
                                                    value={item.line_total}
                                                    onChange={(e) => handleItemChange(idx, 'line_total', parseFloat(e.target.value))}
                                                    InputProps={{ disableUnderline: true, inputProps: { style: { textAlign: 'right' } } }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <IconButton size="small" onClick={() => handleDeleteItem(idx)} color="error">
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Button startIcon={<AddIcon />} onClick={handleAddItem} size="small">
                                                Add Item
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary" disabled={!isMatched}>
                    Save Expense
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ReceiptVerificationModal;

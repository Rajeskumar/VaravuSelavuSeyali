import React from 'react';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { CATEGORY_GROUPS, findMainCategory } from './AddExpenseForm';

interface CategoryPickerFieldProps {
  mainCategory: string;
  subcategory: string;
  onChange: (mainCategory: string, subcategory: string) => void;
  label?: string;
}

/**
 * Structured two-level category picker (main-category chips + subcategory list), extracted from
 * AddExpenseForm so every "add an expense" surface uses the same input instead of three
 * different treatments (the personal/dashboard picker vs. Recurring's and Group's free-text
 * boxes) — free text let users type anything, silently auto-normalized on the next fetch
 * ("Lodging" -> "Hotel", "Dining" -> "Dining out") with no indication it had changed their input,
 * and offered no way to discover valid category names up front.
 */
const CategoryPickerField: React.FC<CategoryPickerFieldProps> = ({ mainCategory, subcategory, onChange, label = 'Category' }) => {
  const resolvedMain = mainCategory && CATEGORY_GROUPS[mainCategory] ? mainCategory : findMainCategory(subcategory);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [pickerMain, setPickerMain] = React.useState(resolvedMain);

  const openMenu = (target: HTMLElement) => {
    setPickerMain(resolvedMain);
    setAnchor(target);
  };

  return (
    <Box>
      <Box
        onClick={(e) => openMenu(e.currentTarget)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openMenu(e.currentTarget as HTMLElement);
        }}
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
            {subcategory ? `${resolvedMain} · ${subcategory}` : 'Choose a category'}
          </Typography>
        </Box>
        <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 1.5, pt: 0.5, pb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 320 }}>
          {Object.keys(CATEGORY_GROUPS).map((cat) => (
            <Box
              key={cat}
              onClick={() => setPickerMain(cat)}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                bgcolor: cat === pickerMain ? 'primary.main' : 'action.hover',
                color: cat === pickerMain ? 'primary.contrastText' : 'text.primary',
              }}
            >
              {cat}
            </Box>
          ))}
        </Box>
        <Divider />
        {CATEGORY_GROUPS[pickerMain].map((sub) => (
          <MenuItem
            key={sub}
            selected={pickerMain === resolvedMain && sub === subcategory}
            onClick={() => {
              onChange(pickerMain, sub);
              setAnchor(null);
            }}
          >
            {sub}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default CategoryPickerField;

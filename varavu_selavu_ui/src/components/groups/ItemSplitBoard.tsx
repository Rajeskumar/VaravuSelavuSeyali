import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { useTheme } from '@mui/material/styles';
import { MemberDTO, GroupExpenseItemEntry } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';

interface ItemSplitBoardProps {
  items: GroupExpenseItemEntry[];
  members: MemberDTO[];
  onChange: (items: GroupExpenseItemEntry[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const ItemSplitBoard: React.FC<ItemSplitBoardProps> = ({
  items,
  members,
  onChange,
  onValidityChange,
}) => {
  const theme = useTheme();

  // Validate: every item must have at least one assigned member with a ratio > 0
  const isValid = items.every((item) => {
    const assignedIds = Object.keys(item.member_ratios);
    return assignedIds.length > 0 && assignedIds.some((id) => item.member_ratios[id] > 0);
  });

  React.useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const toggleMemberForItem = (lineNo: number, memberId: string, checked: boolean) => {
    onChange(
      items.map((item) => {
        if (item.line_no !== lineNo) return item;
        const newRatios = { ...item.member_ratios };
        if (checked) {
          // Add member. We balance evenly by default among selected.
          newRatios[memberId] = 1; 
          // equalize all to 1 (which means equal shares)
          Object.keys(newRatios).forEach((id) => {
            newRatios[id] = 1;
          });
        } else {
          delete newRatios[memberId];
        }
        return { ...item, member_ratios: newRatios };
      })
    );
  };

  const updateRatioForItem = (lineNo: number, memberId: string, ratio: number) => {
    onChange(
      items.map((item) => {
        if (item.line_no !== lineNo) return item;
        const newRatios = { ...item.member_ratios, [memberId]: Math.max(0, ratio) };
        return { ...item, member_ratios: newRatios };
      })
    );
  };

  return (
    <Box>
      {items.map((item, idx) => {
        const assignedIds = Object.keys(item.member_ratios);
        const hasAssignment = assignedIds.length > 0;
        const sumRatios = Object.values(item.member_ratios).reduce((sum, r) => sum + r, 0);

        return (
          <Box
            key={item.line_no}
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              border: `1px solid ${hasAssignment ? theme.palette.divider : theme.palette.error.main}`,
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {item.item_name}
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                ${item.line_total.toFixed(2)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {members.map((m) => {
                const isSelected = item.member_ratios[m.member_id] !== undefined;
                return (
                  <Chip
                    key={m.member_id}
                    label={m.display_name}
                    variant={isSelected ? 'filled' : 'outlined'}
                    color={isSelected ? 'primary' : 'default'}
                    onClick={() => toggleMemberForItem(item.line_no, m.member_id, !isSelected)}
                    avatar={
                      <Avatar sx={{ bgcolor: colorFromMemberId(m.member_id), color: '#fff' }}>
                        {initialsFromName(m.display_name)}
                      </Avatar>
                    }
                  />
                );
              })}
            </Box>

            {/* Custom Ratio Tuning */}
            {assignedIds.length > 1 && (
              <Box sx={{ mt: 1, p: 1.5, backgroundColor: theme.palette.action.hover, borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Adjust Shares (Total: {sumRatios})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {assignedIds.map((id) => {
                    const member = members.find((m) => m.member_id === id);
                    if (!member) return null;
                    return (
                      <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">{member.display_name}</Typography>
                        <TextField
                          size="small"
                          type="number"
                          value={item.member_ratios[id] || 0}
                          onChange={(e) => updateRatioForItem(item.line_no, id, parseFloat(e.target.value) || 0)}
                          sx={{ width: 70 }}
                          inputProps={{ min: 0, step: 1 }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}

            {!hasAssignment && (
              <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
                Item must be assigned to at least one person
              </Typography>
            )}
          </Box>
        );
      })}

      {isValid && (
        <Typography color="success.main" variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
          All items assigned ✓
        </Typography>
      )}
    </Box>
  );
};

export default ItemSplitBoard;

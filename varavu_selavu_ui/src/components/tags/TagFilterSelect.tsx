import React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { useQuery } from '@tanstack/react-query';
import { listTags, TagDTO } from '../../api/tags';

interface TagFilterSelectProps {
  value: string[]; // selected tag ids
  onChange: (tagIds: string[]) => void;
}

/**
 * The primary retrieval surface (PRD §5.2) — multi-select tag filter for Expenses and Analysis.
 * OR semantics within the selection (an expense matching ANY selected tag is included); AND
 * against whatever other filters are active on the page hosting this. Deliberately only offers
 * active tags — a filter for a trip you're done with belongs behind "show archived" in tag
 * management, not cluttering this compact control.
 */
const TagFilterSelect: React.FC<TagFilterSelectProps> = ({ value, onChange }) => {
  const { data: tags = [] } = useQuery({
    queryKey: ['tags', 'autocomplete'],
    queryFn: () => listTags({ status: 'active', limit: 100 }),
    staleTime: 30_000,
  });

  const selected = tags.filter((t) => value.includes(t.id));

  return (
    <Autocomplete
      multiple
      size="small"
      options={tags}
      value={selected}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={(t) => t.name}
      onChange={(_, newValue) => onChange(newValue.map((t) => t.id))}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return (
            <Chip
              key={key}
              {...tagProps}
              label={option.name}
              size="small"
              sx={{ bgcolor: option.color, color: '#fff', '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' } }}
            />
          );
        })
      }
      renderOption={(props, option) => {
        const { key, ...liProps } = props as { key: React.Key } & React.HTMLAttributes<HTMLLIElement>;
        return (
          <li {...liProps} key={key}>
            <Chip label={option.name} size="small" sx={{ bgcolor: option.color, color: '#fff', mr: 1 }} />
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} placeholder={value.length === 0 ? 'Filter by tag' : ''} sx={{ minWidth: 180 }} />
      )}
      sx={{ minWidth: 180 }}
    />
  );
};

export default TagFilterSelect;

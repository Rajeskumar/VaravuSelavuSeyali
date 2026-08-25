import React from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { listTags } from '../../api/tags';
import { similarity } from '../../utils/levenshtein';

const NEAR_DUPLICATE_THRESHOLD = 0.82;
const DEFAULT_MAX_TAGS = 5;
const CREATE_PREFIX = 'Create "';

interface TagInputProps {
  /** Tag names currently applied, in the user's original casing. Full-replace on save, matching
   * the backend's `tag_names` write-through field (PRD §10.2) — this component is a plain
   * controlled `string[]`, it never calls the association API itself. */
  value: string[];
  onChange: (names: string[]) => void;
  maxTags?: number;
}

const filterFn = createFilterOptions<string>();

/**
 * Chip-based multi-select tag input with typeahead, inline "Create «name»" row, and a
 * near-duplicate suggestion (PRD §7.1). Deliberately a plain controlled component — the parent
 * form collects tag names and sends them with the rest of the expense payload; this never talks
 * to the association endpoints directly, so it works identically at create and edit time.
 *
 * Empty state is a subtle "+ Add tag" affordance, not a prominent field (PRD §7.1) — tags are
 * optional and must not add perceived friction to the primary add-expense flow.
 */
const TagInput: React.FC<TagInputProps> = ({ value, onChange, maxTags = DEFAULT_MAX_TAGS }) => {
  // Deliberately separate from Autocomplete's own popup open/close state (below) — MUI's
  // Autocomplete treats a click on an already-open input as a toggle-to-close ('toggleInput'),
  // so reusing one boolean for both "is the widget expanded" and "is the listbox open" made the
  // very click that focuses the input to type immediately collapse it back to the "+ Add tag"
  // button. `expanded` only ever decides which of the two UIs below renders.
  const [expanded, setExpanded] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const { data: myTags = [] } = useQuery({
    queryKey: ['tags', 'autocomplete'],
    queryFn: () => listTags({ status: 'active', limit: 100 }),
    staleTime: 30_000,
  });

  const colorByName = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of myTags) map[t.name.toLowerCase()] = t.color;
    return map;
  }, [myTags]);

  const atLimit = value.length >= maxTags;

  const nearDuplicate = React.useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null;
    const appliedLower = new Set(value.map((v) => v.toLowerCase()));
    let best: { name: string; score: number } | null = null;
    for (const t of myTags) {
      const nameLower = t.name.toLowerCase();
      if (appliedLower.has(nameLower) || nameLower === trimmed.toLowerCase()) continue;
      const score = similarity(trimmed, t.name);
      if (score >= NEAR_DUPLICATE_THRESHOLD && (!best || score > best.score)) {
        best = { name: t.name, score };
      }
    }
    return best;
  }, [inputValue, myTags, value]);

  const addTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || atLimit) {
      setInputValue('');
      return;
    }
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setInputValue('');
      return; // already applied — idempotent, matches backend behavior
    }
    onChange([...value, trimmed]);
    setInputValue('');
  };

  if (!expanded && value.length === 0) {
    return (
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(true)}
        sx={{ background: 'none', border: 'none', p: 0, cursor: 'pointer', font: 'inherit', color: 'text.secondary' }}
      >
        <Typography sx={{ fontSize: 13 }}>+ Add tag</Typography>
      </Box>
    );
  }

  const availableOptions = myTags
    .map((t) => t.name)
    .filter((n) => !value.some((v) => v.toLowerCase() === n.toLowerCase()));

  return (
    <Box>
      <Autocomplete
        multiple
        freeSolo
        size="small"
        autoFocus
        openOnFocus
        // Popup open/close is left uncontrolled (no `open`/`onOpen` prop) — MUI manages its own
        // listbox visibility from focus/typing, which is what lets a click inside the input
        // actually place the cursor there instead of being read as a close toggle.
        onBlur={() => {
          if (inputValue.trim()) addTag(inputValue);
          if (value.length === 0 && !inputValue.trim()) setExpanded(false);
        }}
        options={availableOptions}
        value={value}
        inputValue={inputValue}
        onInputChange={(_, newValue) => setInputValue(newValue)}
        onChange={(_, newValue) => {
          const last = newValue[newValue.length - 1];
          if (typeof last !== 'string') return;
          const match = last.startsWith(CREATE_PREFIX) ? last.slice(CREATE_PREFIX.length, -1) : last;
          addTag(match);
        }}
        filterOptions={(options, params) => {
          const filtered = filterFn(options, params);
          const trimmed = params.inputValue.trim();
          const exists = trimmed && options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
          if (trimmed && !exists && !atLimit) {
            filtered.push(`${CREATE_PREFIX}${trimmed}"`);
          }
          return filtered;
        }}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            const color = colorByName[option.toLowerCase()];
            return (
              <Chip
                key={key}
                {...tagProps}
                label={option}
                size="small"
                sx={color ? { bgcolor: color, color: '#fff', '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' } } : undefined}
              />
            );
          })
        }
        renderOption={(props, option) => {
          const { key, ...liProps } = props as { key: React.Key } & React.HTMLAttributes<HTMLLIElement>;
          if (option.startsWith(CREATE_PREFIX)) {
            return (
              <li {...liProps} key={key}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main' }}>{option}</Typography>
              </li>
            );
          }
          return (
            <li {...liProps} key={key}>
              <Chip label={option} size="small" sx={{ bgcolor: colorByName[option.toLowerCase()] || 'action.selected', mr: 1 }} />
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            placeholder={value.length === 0 ? 'Group expenses across categories — a trip, a project, anything' : ''}
            helperText={atLimit ? `Up to ${maxTags} tags per expense` : undefined}
          />
        )}
      />
      {nearDuplicate && (
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.5 }}>
          Did you mean <b>{nearDuplicate.name}</b>?{' '}
          <Box
            component="button"
            type="button"
            onClick={() => addTag(nearDuplicate.name)}
            sx={{ background: 'none', border: 'none', p: 0, color: 'primary.main', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
          >
            Use it
          </Box>
        </Typography>
      )}
    </Box>
  );
};

export default TagInput;

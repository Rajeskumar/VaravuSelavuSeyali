import React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { EntitySuggestion } from '../../api/entityResolution';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;

interface EntityAutocompleteProps {
  value: string;
  onValueChange: (value: string, selected?: EntitySuggestion) => void;
  fetchSuggestions: (query: string) => Promise<EntitySuggestion[]>;
  textFieldProps?: Partial<TextFieldProps>;
}

/**
 * Free-typed merchant/item name field with typo-tolerant suggestions
 * (TS-ENT-1xx, spec §8/§11.1). `freeSolo` so a name with no canonical match
 * yet is still a valid save — picking a suggestion is optional, not
 * required, and never blocks typing.
 *
 * MUI Autocomplete's dropdown is portal-rendered (Popper), so this is safe
 * to use inside ScannedItemsCard's height-constrained scrolling item list
 * without the suggestion list getting clipped by its `overflow: auto`.
 *
 * Stale-response guard: a debounced fetch can resolve after the user has
 * kept typing past it (e.g. typed "cos" then "cosc" before "cos"'s response
 * lands) — `latestQueryRef` drops any response that isn't for the current
 * query so it can never clobber in-progress typing.
 */
const EntityAutocomplete: React.FC<EntityAutocompleteProps> = ({
  value,
  onValueChange,
  fetchSuggestions,
  textFieldProps,
}) => {
  const [inputValue, setInputValue] = React.useState(value);
  const [options, setOptions] = React.useState<EntitySuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounced = useDebouncedValue(inputValue, DEBOUNCE_MS);
  const latestQueryRef = React.useRef('');

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  React.useEffect(() => {
    const query = debounced.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      return;
    }
    latestQueryRef.current = query;
    let cancelled = false;
    setLoading(true);
    fetchSuggestions(query)
      .then((results) => {
        if (cancelled || latestQueryRef.current !== query) return;
        setOptions(results);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, fetchSuggestions]);

  const { InputProps: extraInputProps, onBlur: extraOnBlur, ...restTextFieldProps } = textFieldProps || {};

  return (
    <Autocomplete
      freeSolo
      autoHighlight
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.display_name)}
      inputValue={inputValue}
      onInputChange={(_, newInputValue, reason) => {
        setInputValue(newInputValue);
        if (reason === 'input' || reason === 'clear') {
          onValueChange(newInputValue);
        }
      }}
      onChange={(_, newValue) => {
        if (newValue == null) return;
        if (typeof newValue === 'string') {
          setInputValue(newValue);
          onValueChange(newValue);
        } else {
          setInputValue(newValue.display_name);
          onValueChange(newValue.display_name, newValue);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          {...restTextFieldProps}
          inputProps={{
            ...params.inputProps,
            onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
              (params.inputProps as any).onBlur?.(e);
              extraOnBlur?.(e);
            },
          }}
          InputProps={{
            ...params.InputProps,
            ...extraInputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={14} sx={{ mr: 0.5 }} /> : null}
                {extraInputProps?.endAdornment}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default EntityAutocomplete;

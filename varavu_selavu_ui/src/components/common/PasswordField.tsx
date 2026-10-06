import React from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';

/** A password TextField with an accessible show/hide toggle, so a typo on a phone keyboard can
 * be seen and fixed instead of retyped blind (and instead of spending one of the few login
 * attempts per minute). */
const PasswordField: React.FC<Omit<TextFieldProps, 'type'>> = ({ slotProps, InputProps, ...rest }) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <TextField
      {...rest}
      type={visible ? 'text' : 'password'}
      InputProps={{
        ...InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              edge="end"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              onMouseDown={(e) => e.preventDefault()}
              sx={{ width: 44, height: 44 }}
            >
              {visible ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      slotProps={slotProps}
    />
  );
};

export default PasswordField;

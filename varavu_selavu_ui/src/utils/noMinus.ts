import React from 'react';

/**
 * Minus values are not accepted in any money or split field (TS-FIX-101). An edit containing one is
 * ignored as a whole: stripping the sign would silently turn "-5" into 5.
 */
const MINUS = /[-−]/;

type ChangeHandler<T extends HTMLInputElement | HTMLTextAreaElement> = (e: React.ChangeEvent<T>) => void;

export function noMinus<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(onChange: ChangeHandler<T>): ChangeHandler<T> {
  return (e) => {
    if (!MINUS.test(e.target.value)) onChange(e);
  };
}

/**
 * For `type="number"` fields. A browser reports a half-typed "-" there as an empty value, so the key
 * itself has to be blocked as well.
 */
export function noMinusProps<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(onChange: ChangeHandler<T>) {
  return {
    onChange: noMinus(onChange),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === '-' || e.key === 'Subtract') e.preventDefault();
    },
  };
}

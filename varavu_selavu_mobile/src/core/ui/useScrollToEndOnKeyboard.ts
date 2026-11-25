import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView } from 'react-native';

/**
 * Keeps a bottom-anchored form (the sign-in screen) above the keyboard.
 *
 * iOS: `KeyboardAvoidingView` pads the form and `keyboardDidShow` fires after that padding settles, so scrolling to the
 * end measures the final viewport.
 *
 * Android: the app uses `softwareKeyboardLayoutMode: "pan"`, so the viewport does NOT shrink when the keyboard opens,
 * the content never overflows and `scrollToEnd` has nothing to do: the password field and Sign in button stayed behind
 * the keyboard (found by the first Android E2E run). So reserve the keyboard's height below the content (`keyboardInset`,
 * add it to the content's bottom padding) and scroll again once that padding has been laid out (`onContentSizeChange`).
 * The keyboard event can still race the layout (Sign in stayed hidden once in ~45 Android sign-in screens), so on Android the
 * scroll is also repeated shortly after the keyboard opens (RESCROLL_DELAYS_MS); a hide or unmount cancels it.
 */
const RESCROLL_DELAYS_MS = [120, 400];

export function useScrollToEndOnKeyboard(ref: React.RefObject<ScrollView | null>): {
  keyboardInset: number;
  onContentSizeChange: () => void;
} {
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardUp = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardUp.current = true;
      clearTimers(); // a repeated show restarts the sequence instead of stacking another one
      if (Platform.OS === 'android') {
        setKeyboardInset(e?.endCoordinates?.height ?? 0);
        timers.current = RESCROLL_DELAYS_MS.map((ms) => setTimeout(() => ref.current?.scrollToEnd({ animated: true }), ms));
      }
      ref.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardUp.current = false;
      clearTimers();
      setKeyboardInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
      clearTimers();
    };
  }, [ref]);

  const onContentSizeChange = useCallback(() => {
    if (keyboardUp.current) ref.current?.scrollToEnd({ animated: true });
  }, [ref]);

  return { keyboardInset, onContentSizeChange };
}

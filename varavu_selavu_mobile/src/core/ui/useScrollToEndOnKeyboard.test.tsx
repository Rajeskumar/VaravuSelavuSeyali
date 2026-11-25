import { Keyboard, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useScrollToEndOnKeyboard } from './useScrollToEndOnKeyboard';

describe('useScrollToEndOnKeyboard', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup() {
    const handlers: Record<string, (e?: unknown) => void> = {};
    const remove = jest.fn();
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e?: unknown) => void) => {
      handlers[event] = cb;
      return { remove, event } as never;
    }) as never);
    const scrollToEnd = jest.fn();
    const ref = { current: { scrollToEnd } } as never;
    const fire = (event: string, payload?: unknown) => act(() => handlers[event]?.(payload));
    return { add, remove, scrollToEnd, ref, fire };
  }

  it('scrolls a bottom-anchored form into view when the keyboard has opened', () => {
    // The keyboard covered the password field and Sign in button of the sign-in form until the user scrolled.
    const { ref, scrollToEnd, fire, add } = setup();
    renderHook(() => useScrollToEndOnKeyboard(ref));
    expect(add).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    fire('keyboardDidShow', { endCoordinates: { height: 300 } });
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('stops listening on unmount', () => {
    const { ref, remove } = setup();
    const { unmount } = renderHook(() => useScrollToEndOnKeyboard(ref));
    unmount();
    expect(remove).toHaveBeenCalledTimes(2); // show + hide
  });

  it('does nothing when the scroll view is not mounted', () => {
    const { fire } = setup();
    renderHook(() => useScrollToEndOnKeyboard({ current: null } as never));
    expect(() => fire('keyboardDidShow', { endCoordinates: { height: 300 } })).not.toThrow();
  });

  describe('Android (windowSoftInputMode "pan": the viewport does not shrink, so there is nothing to scroll)', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

    it('reserves the keyboard height below the content so the form can scroll above it, and releases it on hide', () => {
      // Found by the first Android E2E run: the Sign in button sat behind the keyboard and scrollToEnd did nothing.
      const { ref, fire } = setup();
      const { result } = renderHook(() => useScrollToEndOnKeyboard(ref));
      expect(result.current.keyboardInset).toBe(0);
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      expect(result.current.keyboardInset).toBe(756);
      fire('keyboardDidHide');
      expect(result.current.keyboardInset).toBe(0);
    });

    it('scrolls again once the extra padding has been laid out, but only while the keyboard is up', () => {
      const { ref, fire, scrollToEnd } = setup();
      const { result } = renderHook(() => useScrollToEndOnKeyboard(ref));
      result.current.onContentSizeChange();
      expect(scrollToEnd).not.toHaveBeenCalled(); // keyboard closed: a normal layout change must not scroll
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      scrollToEnd.mockClear();
      result.current.onContentSizeChange();
      expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
      fire('keyboardDidHide');
      scrollToEnd.mockClear();
      result.current.onContentSizeChange();
      expect(scrollToEnd).not.toHaveBeenCalled();
    });
  });

  describe('Android re-scroll (the keyboard event can race the layout; seen once in ~45 sign-in screens)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.replaceProperty(Platform, 'OS', 'android');
    });
    afterEach(() => jest.useRealTimers());

    it('scrolls to the end again shortly after the keyboard opens, so a scroll that landed too early is repeated', () => {
      const { ref, fire, scrollToEnd } = setup();
      renderHook(() => useScrollToEndOnKeyboard(ref));
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      expect(scrollToEnd).toHaveBeenCalledTimes(1);
      act(() => jest.advanceTimersByTime(500));
      expect(scrollToEnd).toHaveBeenCalledTimes(3);
    });

    it('does not re-scroll once the keyboard has closed, and a new show restarts the sequence instead of stacking', () => {
      const { ref, fire, scrollToEnd } = setup();
      renderHook(() => useScrollToEndOnKeyboard(ref));
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      fire('keyboardDidHide');
      scrollToEnd.mockClear();
      act(() => jest.advanceTimersByTime(1000));
      expect(scrollToEnd).not.toHaveBeenCalled();
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      fire('keyboardDidShow', { endCoordinates: { height: 800 } });
      scrollToEnd.mockClear();
      act(() => jest.advanceTimersByTime(1000));
      expect(scrollToEnd).toHaveBeenCalledTimes(2); // one sequence, not two
    });

    it('cancels pending re-scrolls on unmount', () => {
      const { ref, fire, scrollToEnd } = setup();
      const { unmount } = renderHook(() => useScrollToEndOnKeyboard(ref));
      fire('keyboardDidShow', { endCoordinates: { height: 756 } });
      scrollToEnd.mockClear();
      unmount();
      act(() => jest.advanceTimersByTime(1000));
      expect(scrollToEnd).not.toHaveBeenCalled();
    });
  });

  it('does not re-scroll on iOS (unchanged behaviour, verified on the simulator)', () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { ref, fire, scrollToEnd } = setup();
    renderHook(() => useScrollToEndOnKeyboard(ref));
    fire('keyboardDidShow', { endCoordinates: { height: 336 } });
    act(() => jest.advanceTimersByTime(1000));
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('adds no inset on iOS, where KeyboardAvoidingView already pads the form', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { ref, fire } = setup();
    const { result } = renderHook(() => useScrollToEndOnKeyboard(ref));
    fire('keyboardDidShow', { endCoordinates: { height: 336 } });
    expect(result.current.keyboardInset).toBe(0);
  });
});

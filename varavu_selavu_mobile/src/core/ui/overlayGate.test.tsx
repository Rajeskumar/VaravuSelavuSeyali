import { act, renderHook } from '@testing-library/react-native';
import { isAnyOverlayBusy, resetOverlayGateForTests, setOverlayBusy, useOverlayBusy } from './overlayGate';

beforeEach(resetOverlayGateForTests);

test('busy while any overlay holds the gate, free when the last releases', () => {
  const { result } = renderHook(() => useOverlayBusy());
  expect(result.current).toBe(false);
  act(() => setOverlayBusy('a', true));
  act(() => setOverlayBusy('b', true));
  expect(result.current).toBe(true);
  act(() => setOverlayBusy('a', false));
  expect(result.current).toBe(true);
  act(() => setOverlayBusy('b', false));
  expect(result.current).toBe(false);
  expect(isAnyOverlayBusy()).toBe(false);
});
test('repeats and unknown releases are harmless; unmount unsubscribes', () => {
  const { result, unmount } = renderHook(() => useOverlayBusy());
  act(() => { setOverlayBusy('a', true); setOverlayBusy('a', true); });
  act(() => setOverlayBusy('zzz', false));
  expect(result.current).toBe(true);
  unmount();
  expect(() => setOverlayBusy('a', false)).not.toThrow();
});

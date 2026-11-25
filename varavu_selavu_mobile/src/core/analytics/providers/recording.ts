import { AnalyticsProvider } from '../types';

export type RecordedCall =
  | { type: 'collection'; enabled: boolean }
  | { type: 'event'; name: string; params: Record<string, string> }
  | { type: 'screen'; name: string }
  | { type: 'reset' };

/** Test provider: records every call in order. Never talks to a network. */
export function createRecordingProvider(): AnalyticsProvider & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    setCollectionEnabled: (enabled) => { calls.push({ type: 'collection', enabled }); },
    logEvent: (name, params) => { calls.push({ type: 'event', name, params }); },
    logScreen: (name) => { calls.push({ type: 'screen', name }); },
    resetIdentity: () => { calls.push({ type: 'reset' }); },
  };
}

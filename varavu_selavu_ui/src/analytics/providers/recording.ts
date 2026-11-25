import { AnalyticsProvider, PageContext } from './types';
/** Injectable test adapter; never selected by the application's environment configuration. */
export function createRecordingProvider() {
  const events: Array<{ name: string; properties: Record<string, string> }> = [];
  let page: PageContext | undefined;
  let enabled = false;
  const provider: AnalyticsProvider = {
    initialize(_config, context) { enabled = true; page = { ...context }; },
    context(context) { page = { ...context }; },
    track(name, properties) { if (enabled) events.push({ name, properties: { ...page, ...properties } }); },
    disable() { enabled = false; },
    resetIdentity() { enabled = false; page = undefined; },
  };
  return { provider, events };
}

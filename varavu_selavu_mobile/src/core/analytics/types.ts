/**
 * Product-agnostic analytics contract. Core knows nothing about an app's events: the app passes its
 * closed event table (names, features, allowed values) in, and everything else is rejected.
 */
export interface EventProperty {
  /** The only values this property may carry. Free text and numbers are never allowed. */
  values: readonly string[];
  optional?: boolean;
}
export interface EventDefinition {
  feature: string;
  properties: Record<string, EventProperty>;
}
export type EventTable = Record<string, EventDefinition>;

/** Everything a vendor SDK must do. Calls may throw or reject; the client isolates them. */
export interface AnalyticsProvider {
  setCollectionEnabled(enabled: boolean): void | Promise<void>;
  logEvent(name: string, params: Record<string, string>): void | Promise<void>;
  logScreen(name: string): void | Promise<void>;
  /** Forget the SDK's app-instance identity (sign-out, account change, consent withdrawal). */
  resetIdentity(): void | Promise<void>;
}

export interface Operation {
  readonly generation: number;
  readonly token: object;
}

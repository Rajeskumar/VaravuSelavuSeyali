import { AnalyticsConfig } from '../config';
export interface PageContext { page_location: string; page_title: string; page_referrer: string; route_template: string; route_id: string }
export interface AnalyticsProvider {
  initialize(config: AnalyticsConfig, page: PageContext): void;
  context(page: PageContext): void;
  track(name: string, properties: Record<string, string>): void;
  disable(): void;
  resetIdentity(): void;
}
export const noopProvider: AnalyticsProvider = {
  initialize() {}, context() {}, track() {}, disable() {}, resetIdentity() {},
};

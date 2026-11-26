import { analytics } from './index';

export type PermissionName = 'camera' | 'photos' | 'notifications';
const reported = new Set<string>();

/**
 * Reports a permission OUTCOME (never prompt text or user data), once per outcome per app session, because
 * the OS answers repeat requests without asking again. `limited` is iOS's partial photo access. Safe with
 * any SDK response shape. `permission_result` is a cross-app catalog event, which is why core may name it.
 */
export function reportPermission(permission: PermissionName, response: { granted?: boolean; accessPrivileges?: string } | null | undefined): void {
  try {
    const result = !response?.granted ? 'denied' : response.accessPrivileges === 'limited' ? 'limited' : 'granted';
    const key = `${permission}:${result}`;
    if (reported.has(key)) return;
    if (analytics.track('permission_result', { permission, result })) reported.add(key);
  } catch { /* analytics never affects a permission flow */ }
}

/** Test helper. */
export function resetReportedPermissions(): void { reported.clear(); }

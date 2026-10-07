import type { Role } from './permissions'

/**
 * Permission layer (docs/22 §3). Authorization is expressed as permissions, not scattered
 * `role === 'ADMIN'` checks. For V1 the permissions are derived from the role by a static map here
 * (no database tables); if roles ever become dynamic, this map moves to `role_permissions` in the DB
 * without changing any call site. Every check must run on the server - the UI only hides things.
 */
export type Permission =
  | 'ENQUIRY_VIEW'
  | 'ENQUIRY_CONVERT'
  | 'PROJECT_VIEW'
  | 'PROJECT_EDIT'
  | 'CLIENT_VIEW'
  | 'CLIENT_EDIT'
  | 'QUOTE_VIEW'
  | 'QUOTE_EDIT'
  | 'FINANCE_VIEW'
  | 'CALENDAR_VIEW'
  | 'CALENDAR_MANAGE'
  | 'USER_MANAGE'
  | 'AUTH_LOG_VIEW'
  | 'AUDIT_LOG_VIEW'
  | 'SETTINGS_EDIT'
  // Heavy / irreversible money operations (docs/33 §2): mark an invoice uncollectible, refund a payment,
  // delete invoices or quotes. ADMIN only.
  | 'MONEY_ADMIN'

// The everyday CRM work a staff member does. Admin gets this plus the sensitive/management ones.
const STAFF_CRM: Permission[] = [
  'ENQUIRY_VIEW',
  'ENQUIRY_CONVERT',
  'PROJECT_VIEW',
  'PROJECT_EDIT',
  'CLIENT_VIEW',
  'CLIENT_EDIT',
  'QUOTE_VIEW',
  'QUOTE_EDIT',
  'FINANCE_VIEW',
  'CALENDAR_VIEW',
  'CALENDAR_MANAGE',
]

// A read-only reviewer: every VIEW permission, nothing that writes, no Activity / Settings / Users.
const READ_ONLY: Permission[] = ['ENQUIRY_VIEW', 'PROJECT_VIEW', 'CLIENT_VIEW', 'QUOTE_VIEW', 'FINANCE_VIEW', 'CALENDAR_VIEW']

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [...STAFF_CRM, 'USER_MANAGE', 'AUTH_LOG_VIEW', 'AUDIT_LOG_VIEW', 'SETTINGS_EDIT', 'MONEY_ADMIN'],
  STUDIO: STAFF_CRM,
  SUPERVISOR: READ_ONLY,
}

/** A read-only account: may look at the CRM but every write is refused (server) and locked (UI). */
export function isReadOnly(user: { role: Role } | null | undefined): boolean {
  return user?.role === 'SUPERVISOR'
}

/** True when the user's role grants the permission. Returns false for a missing user. */
export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return ROLE_PERMISSIONS[user.role].includes(permission)
}

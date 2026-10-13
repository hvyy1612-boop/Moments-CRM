import type { Role } from './permissions'

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
  // Heavy / irreversible money operations: mark an invoice uncollectible, refund a payment, delete
  // invoices or quotes. Held by ADMIN and STUDIO (Staff) - see STAFF_FULL below.
  | 'MONEY_ADMIN'

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

const READ_ONLY: Permission[] = ['ENQUIRY_VIEW', 'PROJECT_VIEW', 'CLIENT_VIEW', 'QUOTE_VIEW', 'FINANCE_VIEW', 'CALENDAR_VIEW']

const STAFF_FULL: Permission[] = [...STAFF_CRM, 'USER_MANAGE', 'SETTINGS_EDIT', 'MONEY_ADMIN']

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [...STAFF_FULL, 'AUTH_LOG_VIEW', 'AUDIT_LOG_VIEW'],
  STUDIO: STAFF_FULL,
  SUPERVISOR: READ_ONLY,
}

export function isReadOnly(user: { role: Role } | null | undefined): boolean {
  return user?.role === 'SUPERVISOR'
}

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return ROLE_PERMISSIONS[user.role].includes(permission)
}

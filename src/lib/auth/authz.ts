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

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [...STAFF_CRM, 'USER_MANAGE', 'AUTH_LOG_VIEW', 'AUDIT_LOG_VIEW', 'SETTINGS_EDIT'],
  STUDIO: STAFF_CRM,
  EDITOR: ['ENQUIRY_VIEW', 'PROJECT_VIEW', 'CLIENT_VIEW', 'QUOTE_VIEW', 'FINANCE_VIEW', 'CALENDAR_VIEW'],
}

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return ROLE_PERMISSIONS[user.role].includes(permission)
}

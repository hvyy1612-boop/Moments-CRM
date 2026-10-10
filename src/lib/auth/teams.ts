import type { Role } from './permissions'

export const TEAMS = [
  { slug: 'admin', role: 'ADMIN', label: 'Admins' },
  { slug: 'studio', role: 'STUDIO', label: 'Staff' },
  { slug: 'supervisor', role: 'SUPERVISOR', label: 'Supervisors' },
] as const satisfies readonly { slug: string; role: Role; label: string }[]

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', STUDIO: 'Staff', SUPERVISOR: 'Supervisor' }

export type TeamSlug = (typeof TEAMS)[number]['slug']

export function teamBySlug(slug: string): (typeof TEAMS)[number] | undefined {
  return TEAMS.find((t) => t.slug === slug)
}

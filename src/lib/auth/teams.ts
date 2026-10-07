import type { Role } from './permissions'

/**
 * Staff teams = the login roles, presented as named groups in the Users screen and the roster PDF.
 * Pure module (no server deps) so both server pages and the client list can import it.
 */
export const TEAMS = [
  { slug: 'admin', role: 'ADMIN', label: 'Admins' },
  { slug: 'studio', role: 'STUDIO', label: 'Staff' },
  { slug: 'supervisor', role: 'SUPERVISOR', label: 'Supervisors' },
] as const satisfies readonly { slug: string; role: Role; label: string }[]

/** The role as people say it (STUDIO is shown as "Staff"). */
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', STUDIO: 'Staff', SUPERVISOR: 'Supervisor' }

export type TeamSlug = (typeof TEAMS)[number]['slug']

export function teamBySlug(slug: string): (typeof TEAMS)[number] | undefined {
  return TEAMS.find((t) => t.slug === slug)
}

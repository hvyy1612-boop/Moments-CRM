import type { Role } from './permissions'

/**
 * Staff teams = the login roles, presented as named groups in the Users screen and the roster PDF.
 * Pure module (no server deps) so both server pages and the client list can import it.
 */
export const TEAMS = [
  { slug: 'admin', role: 'ADMIN', label: 'Admins' },
  { slug: 'studio', role: 'STUDIO', label: 'Studio' },
] as const satisfies readonly { slug: string; role: Role; label: string }[]

export type TeamSlug = (typeof TEAMS)[number]['slug']

export function teamBySlug(slug: string): (typeof TEAMS)[number] | undefined {
  return TEAMS.find((t) => t.slug === slug)
}

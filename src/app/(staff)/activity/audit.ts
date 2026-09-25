/**
 * Human-readable labels + categories for audit-log actions and sign-in events, so the Activity page reads
 * as a security/account audit trail (OWASP-style) rather than raw event codes like "client.created". Pure
 * functions - safe to use from the server page or a client table component.
 */

type Domain = { category: string; noun: string }

// Maps an action's domain (the part before the first dot) to a display category + a singular noun.
const DOMAIN: Record<string, Domain> = {
  auth: { category: 'Authentication & users', noun: 'Account' },
  client: { category: 'Clients', noun: 'Client' },
  contact: { category: 'Clients', noun: 'Contact' },
  enquiry: { category: 'Enquiries', noun: 'Enquiry' },
  quote: { category: 'Quotes', noun: 'Quote' },
  booking: { category: 'Bookings', noun: 'Booking' },
  contract: { category: 'Contracts', noun: 'Contract' },
  change_request: { category: 'Change requests', noun: 'Change request' },
  invoice: { category: 'Finance', noun: 'Invoice' },
  payment: { category: 'Finance', noun: 'Payment' },
  project: { category: 'Jobs', noun: 'Job' },
  job: { category: 'Jobs', noun: 'Job' },
  gallery: { category: 'Delivery', noun: 'Gallery' },
  automation: { category: 'Settings', noun: 'Settings' },
}

// Hand-written labels for the security/business events worth reading clearly (fallback handles the rest).
const SPECIAL: Record<string, string> = {
  'auth.activity_pin_set': 'Activity PIN set',
  'auth.activity_pin_reset': 'Activity PIN reset via password',
  'auth.activity_password_unlock': 'Activity opened with password',
  'auth.staff_created': 'Staff member added',
  'auth.staff_removed': 'Staff member removed',
  'auth.user_registered': 'User account registered',
  'automation.settings_changed': 'Notification settings changed',
  'client.deleted': 'Client deleted',
  'client.merged': 'Clients merged',
  'client.restored': 'Client restored',
  'enquiry.converted': 'Enquiry converted to job',
  'enquiry.lost': 'Enquiry marked lost',
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Display area for grouping/tagging, e.g. "client.created" -> "Clients". */
export function auditCategory(action: string): string {
  return DOMAIN[action.split('.')[0] ?? '']?.category ?? 'Other'
}

/** Human label, e.g. "client.created" -> "Client created", "enquiry.moved_to_quote" -> "Enquiry moved to quote". */
export function auditLabel(action: string): string {
  const special = SPECIAL[action]
  if (special) return special
  const [domain = '', ...rest] = action.split('.')
  const noun = DOMAIN[domain]?.noun ?? cap(domain)
  const verb = rest.join(' ').replace(/_/g, ' ')
  return `${noun} ${verb}`.trim()
}

/** Sign-in event label; the SUCCESS/FAILURE outcome is shown separately as a pill. */
export function signInLabel(eventType: string): string {
  if (eventType.startsWith('LOGIN')) return 'Sign in'
  return cap(eventType.toLowerCase().replace(/_/g, ' '))
}

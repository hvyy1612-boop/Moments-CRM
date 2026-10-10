

type Domain = { category: string; noun: string }

const DOMAIN: Record<string, Domain> = {
  auth: { category: 'Authentication & users', noun: 'Account' },
  client: { category: 'Clients', noun: 'Client' },
  contact: { category: 'Clients', noun: 'Contact' },
  enquiry: { category: 'Leads', noun: 'Lead' },
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

const SPECIAL: Record<string, string> = {
  'auth.activity_pin_set': 'Activity PIN set',
  'auth.activity_pin_reset': 'Activity PIN reset via password',
  'auth.activity_password_unlock': 'Activity opened with password',
  'auth.activity_password_failed': 'Activity password attempt failed',
  'auth.staff_created': 'Staff member added',
  'auth.staff_removed': 'Staff member removed',
  'auth.staff_password_reset': 'Staff password reset',
  'auth.staff_enabled': 'Staff account enabled',
  'auth.staff_disabled': 'Staff account disabled',
  'auth.login_id_changed': 'Login ID changed',
  'auth.user_registered': 'User account registered',
  'auth.staff_registered': 'Staff signed up',
  'auth.signup_opened': 'Staff sign-up opened',
  'auth.signup_closed': 'Staff sign-up closed',
  'automation.settings_changed': 'Notification settings changed',
  'client.deleted': 'Client deleted',
  'client.restored': 'Client restored',

  'enquiry.created': 'Lead created',
  'enquiry.public_submitted': 'Website enquiry received',
  'enquiry.replied': 'Reply sent to client',
  'enquiry.client_replied': 'Client message logged',
  'enquiry.stage_auto': 'Lead stage moved on',
  'enquiry.status': 'Lead stage changed',
  'enquiry.moved_to_quote': 'Lead moved to consultation',
  'enquiry.converted': 'Moved to Awaiting booking confirmation',
  'enquiry.lost': 'Lead archived',
  'enquiry.job_accepted': 'Job accepted ticked (lead is now a job)',
  'enquiry.job_complete': 'Job complete ticked on the lead',
  'project.completed_manual': 'Job complete ticked (job moved to Completed)',
  'project.reopened': 'Job complete unticked (job back in Active)',
  'enquiry.job_complete_cleared': 'Job complete unticked on the lead',
  'enquiry.reopened': 'Lead restored',
  'enquiry.booking_confirmed': 'Booking confirmed (now a job)',
  'enquiry.moved_back_to_lead': 'Job accepted unticked, back to awaiting deposit',
  'project.moved_back_to_lead': 'Job accepted unticked, moved back to Leads',
  'enquiry.booking_cancelled': 'Booking cancelled',

  'booking.created': 'Shoot scheduled',
  'booking.rescheduled': 'Shoot rescheduled',
  'booking.moved': 'Shoot moved on the calendar',
  'calendar.feed_link_reset': 'Calendar sync link reset',
  'booking.requested': 'Booking requested',
  'booking.confirmed': 'Booking confirmed',
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export function auditCategory(action: string): string {
  return DOMAIN[action.split('.')[0] ?? '']?.category ?? 'Other'
}

export function auditLabel(action: string): string {
  const special = SPECIAL[action]
  if (special) return special
  const [domain = '', ...rest] = action.split('.')
  const noun = DOMAIN[domain]?.noun ?? cap(domain)
  const verb = rest.join(' ').replace(/_/g, ' ')
  return `${noun} ${verb}`.trim()
}

export function signInLabel(eventType: string): string {
  if (eventType.startsWith('LOGIN')) return 'Sign in'
  return cap(eventType.toLowerCase().replace(/_/g, ' '))
}

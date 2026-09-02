import { GoogleMark } from './GoogleMark'

/**
 * The staff "Continue with Google" button (§8.5, BR-G): a white surface with a hairline --line border
 * and the official Google mark. It links to the OAuth start route (a GET that redirects to Google). The
 * page only renders this when googleEnabled is true (BR-G11), so an unconfigured deploy never shows a
 * dead control. Kept a plain <a> (not next/link) because the target is a backend redirect, not a page.
 */
export function GoogleButton({
  label = 'Continue with Google',
  href = '/api/auth/google',
}: {
  label?: string
  href?: string
}) {
  return (
    <a
      href={href}
      className="inline-flex h-10 w-full items-center justify-center gap-3 rounded border border-line bg-surface text-base font-medium text-ink outline-none transition-colors duration-150 hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent"
    >
      <GoogleMark className="h-5 w-5" />
      {label}
    </a>
  )
}

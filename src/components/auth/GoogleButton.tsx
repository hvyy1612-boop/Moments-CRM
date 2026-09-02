import { GoogleMark } from './GoogleMark'

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

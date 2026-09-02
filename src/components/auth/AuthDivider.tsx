/** A labelled rule ("Or") separating the email form from the Google button on the auth pages. */
export function AuthDivider({ label = 'Or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-line" />
      <span className="text-sm text-muted">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

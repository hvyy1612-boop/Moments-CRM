
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none ${className ?? ''}`}
    />
  )
}

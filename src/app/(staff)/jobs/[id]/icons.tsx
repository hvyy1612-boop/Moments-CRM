// Small outline icon set for the Job detail page, drawn in the app's house style
// (24x24 viewBox, currentColor stroke, 1.6 width) so they match BackLink and the nav.

type IconProps = { className?: string }

function Svg({ className = 'h-4 w-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconUser = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" /></Svg>
)
export const IconSystem = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
  </Svg>
)
export const IconMore = (p: IconProps) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></Svg>
)
export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
)
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></Svg>
)
export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21c4-4.2 6-7.2 6-10a6 6 0 1 0-12 0c0 2.8 2 5.8 6 10Z" /><circle cx="12" cy="11" r="2.2" /></Svg>
)
export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.1 2.7-5 6-5s6 1.9 6 5" /><path d="M16 5.2A3 3 0 0 1 16 11M21 20c0-2.6-1.6-4.3-4-4.8" /></Svg>
)
export const IconChevron = (p: IconProps) => (
  <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
)
export const IconLayout = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10" /></Svg>
)
export const IconChecklist = (p: IconProps) => (
  <Svg {...p}><path d="M4 6.5l1.6 1.6L8.5 5M4 13l1.6 1.6L8.5 11.5M4 19l1.6 1.6L8.5 18M12 6.5h8M12 13h8M12 19.5h8" /></Svg>
)
export const IconCamera = (p: IconProps) => (
  <Svg {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.2" /></Svg>
)
export const IconFolder = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Svg>
)
export const IconReceipt = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" /><path d="M9 8h6M9 12h6" /></Svg>
)

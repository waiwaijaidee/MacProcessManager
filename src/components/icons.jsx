/**
 * Inline SVG icon set (lucide-style geometry, 24x24 viewBox).
 * Bundled as plain components so the app ships with zero icon dependencies.
 */
import React from 'react'

function Svg({ children, size = 16, strokeWidth = 1.9, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconActivity = (p) => (
  <Svg {...p}>
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </Svg>
)

export const IconList = (p) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
)

export const IconGrid = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
)

export const IconCpu = (p) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2.5" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </Svg>
)

export const IconMemory = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10v4M11 10v4M15 10v4M19 10v4" />
  </Svg>
)

export const IconDisk = (p) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 1 18 0v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
    <path d="M3 12h18" />
    <circle cx="7.5" cy="16.5" r="1" />
  </Svg>
)

export const IconPower = (p) => (
  <Svg {...p}>
    <path d="M12 3v9" />
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
  </Svg>
)

export const IconSettings = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.1 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Svg>
)

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
)

export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
)

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
)

export const IconZap = (p) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
)

export const IconInfo = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </Svg>
)

export const IconChevronRight = (p) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
)

export const IconChevronDown = (p) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const IconChevronUp = (p) => (
  <Svg {...p}>
    <path d="m18 15-6-6-6 6" />
  </Svg>
)

export const IconSort = (p) => (
  <Svg {...p}>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
  </Svg>
)

export const IconPause = (p) => (
  <Svg {...p}>
    <rect x="7" y="5" width="3.5" height="14" rx="1" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
  </Svg>
)

export const IconPlay = (p) => (
  <Svg {...p}>
    <path d="M7 4.5 19 12 7 19.5z" />
  </Svg>
)

export const IconTerminal = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="m7 9 2.5 2.5L7 14M12.5 15H17" />
  </Svg>
)

export const IconFolder = (p) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l1.8 2.2h7A2.5 2.5 0 0 1 20 9.7v7.8A2.5 2.5 0 0 1 17.5 20h-12A2.5 2.5 0 0 1 3 17.5z" />
  </Svg>
)

export const IconNetwork = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
  </Svg>
)

export const IconLayers = (p) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
)

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
)

export const IconLock = (p) => (
  <Svg {...p}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Svg>
)

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Svg>
)

export const IconMonitor = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12.5" rx="2.5" />
    <path d="M9 20.5h6M12 16.5v4" />
  </Svg>
)

export const IconLogOut = (p) => (
  <Svg {...p}>
    <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H15" />
    <path d="M10 8.5 6.5 12 10 15.5M6.5 12H16" />
  </Svg>
)

export const IconRestart = (p) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3.2-6.9" />
    <path d="M3 3.5V10h6.5" />
  </Svg>
)

export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.6 3 8 7 9 4-1 7-4.4 7-9V6z" />
    <path d="m9.5 12 1.8 1.8 3.4-3.6" />
  </Svg>
)

export const IconAlert = (p) => (
  <Svg {...p}>
    <path d="M10.3 4 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4.5M12 17h.01" />
  </Svg>
)

export const IconCheck = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
  </Svg>
)

export const IconGauge = (p) => (
  <Svg {...p}>
    <path d="M4 18a9 9 0 1 1 16 0" />
    <path d="m12 14 4.2-4.4" />
    <circle cx="12" cy="15" r="1.6" />
  </Svg>
)

export const IconStop = (p) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Svg>
)

export const IconSliders = (p) => (
  <Svg {...p}>
    <path d="M5 4v6M5 14v6M12 4v10M12 18v2M19 4v2M19 10v10" />
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="16" r="2" />
    <circle cx="19" cy="8" r="2" />
  </Svg>
)

export const IconSparkles = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z" />
    <path d="M18.5 15.5 19.3 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8z" />
  </Svg>
)

export const IconShieldOff = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.6 3 8 7 9 4-1 7-4.4 7-9V6z" />
    <path d="M9 12h6" />
  </Svg>
)

export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
)

export const IconExternal = (p) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
  </Svg>
)

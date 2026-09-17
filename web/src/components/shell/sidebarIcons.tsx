/**
 * Sol kenar çubuğu ve masthead ikonları.
 *
 * Ne yapar: Favoriler / iş akışları / pin / gelen kutusu SVG’lerini çizer.
 * Ne yapmaz: Tıklama veya açık/kapalı state tutmaz — yalnızca görünüm.
 * İlgili: docs/refactor-plan.md — Faz 1 (kabuk JSX).
 */
export function SidebarStarIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="sidebar-star-icon">
      <path
        d="M12 2.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 15.9l-5.1 2.68.97-5.67-4.12-4.02 5.7-.83L12 2.5z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SidebarFlowIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="6" cy="6" r="2.15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="18" r="2.15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="6" r="2.15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 8.2v7.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8.2 6h5.4A4.4 4.4 0 0 1 18 10.4V18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SidebarPinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="sidebar-pin-icon">
      <path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03-1 1.03 1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={pinned ? 0 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m22 6-10 7L2 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

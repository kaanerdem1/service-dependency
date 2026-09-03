import type { MouseEvent } from 'react'

export function StarIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d="M12 2.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 15.9l-5.1 2.68.97-5.67-4.12-4.02 5.7-.83L12 2.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  )
}

type Props = {
  active: boolean
  onToggle: () => void
  className?: string
  size?: number
  title?: string
}

export function FavoriteStarButton({
  active,
  onToggle,
  className = 'fav-star-btn',
  size = 14,
  title,
}: Props) {
  const label = title ?? (active ? 'Favorilerden çıkar' : 'Favorilere ekle')

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onToggle()
  }

  return (
    <button
      type="button"
      className={`${className}${active ? ' is-on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={handleClick}
    >
      <StarIcon filled={active} size={size} />
    </button>
  )
}

import type { ReactNode } from 'react'

type Props = {
  label: string
  /** Klavye kısayolu vb. ikinci satır */
  sub?: string
  placement?: 'rail' | 'head'
  className?: string
  children: ReactNode
}

/** Modül sidebar — ikon üzerinde hover’da isim (+ isteğe bağlı kısayol). */
export function SidebarHoverTip({
  label,
  sub,
  placement = 'head',
  className = '',
  children,
}: Props) {
  return (
    <span
      className={`sidebar-hover-tip is-${placement}${className ? ` ${className}` : ''}`}
    >
      {children}
      <span className="sidebar-hover-tip-pop" role="tooltip">
        <span className="sidebar-hover-tip-label">{label}</span>
        {sub ? <span className="sidebar-hover-tip-sub">{sub}</span> : null}
      </span>
    </span>
  )
}

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { MorphHoverIndicator } from './MorphHover'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  layoutId: string
  morphClassName?: string
  children: ReactNode
}

/** Masthead / sidebar — Morphin tarzı hover arka plan morph */
export function MorphHoverButton({
  layoutId,
  morphClassName = 'morph-hover-btn-bg',
  className = '',
  children,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Props) {
  const [hover, setHover] = useState(false)

  return (
    <button
      type="button"
      className={`morph-hover-btn${className ? ` ${className}` : ''}`}
      onMouseEnter={(e) => {
        setHover(true)
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setHover(false)
        onMouseLeave?.(e)
      }}
      {...props}
    >
      <MorphHoverIndicator active={hover} layoutId={layoutId} className={morphClassName} />
      <span className="morph-hover-btn-inner">{children}</span>
    </button>
  )
}

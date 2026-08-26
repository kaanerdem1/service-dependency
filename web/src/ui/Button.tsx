import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'secondary'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  compact?: boolean
}

export function Button({
  variant = 'secondary',
  compact,
  className = '',
  type = 'button',
  ...props
}: Props) {
  const variantClass =
    variant === 'primary'
      ? 'ui-btn--primary'
      : variant === 'ghost'
        ? 'ui-btn--ghost'
        : ''
  const compactClass = compact ? ' ui-btn--compact' : ''
  return (
    <button
      type={type}
      className={`ui-btn${variantClass ? ` ${variantClass}` : ''}${compactClass}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}

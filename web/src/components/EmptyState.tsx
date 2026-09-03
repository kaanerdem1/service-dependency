type Props = {
  what: string
  action?: string
  className?: string
}

/** Boş durum: ne olacak + ne yapmalısın */
export function EmptyState({
  what,
  action,
  className,
  variant = 'default',
}: Props & { variant?: 'default' | 'catalog' }) {
  return (
    <div
      className={`empty-state${variant === 'catalog' ? ' empty-state-catalog' : ''}${className ? ` ${className}` : ''}`}
    >
      {variant === 'catalog' ? <span className="empty-state-icon" aria-hidden /> : null}
      <p className="empty-state-what">{what}</p>
      {action ? <p className="empty-state-do">{action}</p> : null}
    </div>
  )
}

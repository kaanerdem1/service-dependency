type Props = {
  what: string
  action?: string
  className?: string
}

/** Boş durum: ne olacak + ne yapmalısın */
export function EmptyState({ what, action, className }: Props) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      <p className="empty-state-what">{what}</p>
      {action ? <p className="empty-state-do">{action}</p> : null}
    </div>
  )
}

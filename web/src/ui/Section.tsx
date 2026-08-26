import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Section({ title, description, children, className = '' }: Props) {
  return (
    <section className={className || undefined}>
      <h3 className="ui-section-title">{title}</h3>
      {description ? <p className="ui-section-desc">{description}</p> : null}
      {children}
    </section>
  )
}

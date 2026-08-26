import type { HTMLAttributes, ReactNode } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  as?: 'div' | 'section'
}

export function Card({ children, className = '', as: Tag = 'div', ...props }: Props) {
  return (
    <Tag className={`ui-card${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </Tag>
  )
}

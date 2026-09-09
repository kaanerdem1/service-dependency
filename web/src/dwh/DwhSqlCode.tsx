import type { ReactNode } from 'react'

type Props = {
  sql?: string | null
  highlightTable?: string | null
  highlightColumn?: string | null
}

type Token = {
  value: string
  kind: 'comment' | 'string' | 'number' | 'word' | 'space' | 'symbol'
}

const SQL_KEYWORDS = new Set([
  'select', 'insert', 'into', 'update', 'delete', 'merge', 'using', 'on', 'from', 'where',
  'and', 'or', 'not', 'in', 'exists', 'is', 'null', 'join', 'left', 'right', 'inner',
  'outer', 'full', 'cross', 'union', 'all', 'distinct', 'group', 'by', 'order', 'having',
  'as', 'case', 'when', 'then', 'else', 'end', 'values', 'set', 'execute', 'immediate',
  'commit', 'rollback', 'truncate', 'table', 'create', 'replace', 'procedure', 'begin',
  'exception', 'others', 'raise', 'return', 'declare', 'cursor', 'loop', 'elsif', 'for',
  'while', 'with', 'over', 'partition', 'asc', 'desc', 'between', 'like', 'nvl', 'decode',
  'to_date', 'to_char', 'to_number', 'cast', 'substr', 'trim', 'count', 'sum', 'avg',
  'min', 'max', 'rank', 'rowid', 'sysdate', 'dual', 'connect', 'prior', 'nulls', 'first',
  'last',
])

const TOKEN_PATTERN = /(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\b\d+\.?\d*\b)|([A-Za-z_][A-Za-z0-9_$#]*(?:@[A-Za-z0-9_$#]+)?)|(\s+)|([^\sA-Za-z0-9_])/g

function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  TOKEN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_PATTERN.exec(sql)) !== null) {
    const value = match[0]
    const kind: Token['kind'] = match[1] || match[2]
      ? 'comment'
      : match[3]
        ? 'string'
        : match[4]
          ? 'number'
          : match[5]
            ? 'word'
            : match[6]
              ? 'space'
              : 'symbol'
    tokens.push({ value, kind })
  }
  return tokens
}

function normalizedMatch(value: string, target?: string | null): boolean {
  if (!target) return false
  const normalizedValue = value.split('@')[0].toLowerCase()
  const normalizedTarget = target.trim().toLowerCase()
  return normalizedValue === normalizedTarget || normalizedValue === normalizedTarget.split('.').pop()
}

function renderToken(token: Token, index: number, table?: string | null, column?: string | null): ReactNode {
  if (token.kind === 'word') {
    if (normalizedMatch(token.value, table) || normalizedMatch(token.value, column)) {
      return <mark key={index} className="dwh-sql-token-highlight">{token.value}</mark>
    }
    if (SQL_KEYWORDS.has(token.value.toLowerCase())) {
      return <span key={index} className="dwh-sql-token-keyword">{token.value}</span>
    }
  }

  if (token.kind === 'comment') return <span key={index} className="dwh-sql-token-comment">{token.value}</span>
  if (token.kind === 'string') return <span key={index} className="dwh-sql-token-string">{token.value}</span>
  if (token.kind === 'number') return <span key={index} className="dwh-sql-token-number">{token.value}</span>
  return token.value
}

export function DwhSqlCode({ sql, highlightTable, highlightColumn }: Props) {
  const text = sql || ''
  return (
    <pre className="dwh-sql-block dwh-sql-code">
      {tokenize(text).map((token, index) => renderToken(token, index, highlightTable, highlightColumn))}
    </pre>
  )
}

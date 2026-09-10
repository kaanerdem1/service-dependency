import { Dialect, format, parse } from '@polyglot-sql/sdk'

type KeywordHit = { index: number; depth: number }

/** Builds the legacy-style display summary used by the optional DWH SQL view. */
export function simplifySql(sql: string | null | undefined): string | null {
  const text = sql?.trim()
  if (!text) return null

  // Parse is attempted for dialect validation, but is not a hard gate because
  // Polyglot's formatter supports some Oracle syntax its AST parser rejects.
  const parsed = parse(text, Dialect.Oracle)
  // Polyglot's formatter accepts a wider set of Oracle production syntax than
  // its AST parser in some releases. A parse miss is therefore non-fatal: the
  // formatter plus structural scanner remains the display fallback.
  void parsed

  const formatted = format(text, Dialect.Oracle)
  // Formatting is only cosmetic. Long Oracle statements can be rejected by
  // the formatter even though their structure is still safely scannable.
  // Keep the original text as the structural fallback instead of losing the
  // Sade view altogether.
  const sourceText = formatted.success && formatted.sql?.[0] ? formatted.sql[0] : text

  try {
    return simplifyStatement(sourceText)
  } catch (error) {
    console.error('sqlSimplify: summary failed', error)
    return null
  }
}

function simplifyStatement(statement: string): string | null {
  const firstKeyword = readFirstKeyword(stripLeadingComments(statement))
  if (firstKeyword === 'INSERT') return simplifyInsert(statement)
  if (firstKeyword === 'MERGE') return simplifyMerge(statement)
  return null
}

function simplifyInsert(statement: string): string | null {
  const into = findKeyword(statement, 'INTO', 0, 0)
  if (!into) return null

  // INSERT sources may be wrapped as `(...SELECT...)`; in that form SELECT is
  // one parenthesis level deeper than INTO, so depth must not be restricted.
  const select = findKeyword(statement, 'SELECT', into.index + 4)
  if (!select) return null

  const targetPart = statement.slice(into.index + 4, select.index)
  const target = parseInsertTarget(targetPart.trim())
  const sourceWrapped = targetPart.trimEnd().endsWith('(')
  const sourceText = statement.slice(select.index).trim()
  const source = summarizeQuery(sourceWrapped ? trimClosingWrapper(sourceText) : sourceText)
  if (!target || !source) return null
  return `${target}\n${source}`.trim()
}

function simplifyMerge(statement: string): string | null {
  const into = findKeyword(statement, 'INTO', 0, 0)
  const using = findKeyword(statement, 'USING', into ? into.index + 4 : 0, 0)
  if (!into || !using) return null

  const target = statement.slice(into.index + 4, using.index).trim()
  const usingStart = skipWhitespace(statement, using.index + 5)
  if (!target) return null

  if (statement[usingStart] !== '(') {
    const select = findKeyword(statement, 'SELECT', usingStart)
    const source = select ? summarizeQuery(statement.slice(select.index).trim()) : null
    return source ? `MERGE INTO ${target}\n${source}`.trim() : null
  }

  const usingEnd = findMatchingParen(statement, usingStart)
  if (usingEnd < 0) return null

  // Match legacy: display the USING query, not MERGE's ON/WHEN/UPDATE clauses.
  const source = summarizeQuery(statement.slice(usingStart + 1, usingEnd).trim())
  return source ? `MERGE INTO ${target}\n${source}`.trim() : null
}

function parseInsertTarget(targetPart: string): string | null {
  const open = findCharOutside(targetPart, '(', 0)
  if (open < 0) return `INSERT INTO ${targetPart}`

  const close = findMatchingParen(targetPart, open)
  // `INSERT INTO table ( SELECT ... )` wraps the source query. The closing
  // parenthesis is after SELECT, so it is not present in targetPart; this is
  // not an explicit target-column list.
  if (close < 0) {
    const target = targetPart.slice(0, open).trim()
    return target ? `INSERT INTO ${target}` : null
  }

  const target = targetPart.slice(0, open).trim()
  if (!target) return null
  const count = countItems(targetPart.slice(open + 1, close))
  return `INSERT INTO ${target} ( ...${count} kolon... )`
}

function summarizeQuery(query: string): string | null {
  const text = stripOuterParentheses(query.trim())
  if (!text) return null

  const unionParts = splitTopLevelUnion(text)
  if (unionParts.length > 1) {
    return unionParts
      .map(({ sql, operator }) => {
        const part = summarizeQuery(sql)
        return part ? `${part}${operator ? `\n${operator}` : ''}` : null
      })
      .filter((part): part is string => Boolean(part))
      .join('\n')
  }

  const select = findKeyword(text, 'SELECT', 0, 0)
  const from = select ? findKeyword(text, 'FROM', select.index + 6, 0) : null
  if (!select) return null

  if (!from) {
    const expressions = text.slice(select.index + 6).trim()
    return expressions ? `SELECT ...${countItems(expressions)} ifade...` : null
  }

  const expressionCount = countItems(text.slice(select.index + 6, from.index))
  // Legacy always replaces the projection list with a count, including a
  // single `*`; this is a display summary and never claims semantic equality.
  const projection = `SELECT ...${expressionCount} ifade...`

  const rest = rewriteNestedQueries(text.slice(from.index).trimStart())
  return `${projection}\n${rest}`.trim()
}

function rewriteNestedQueries(text: string): string {
  let result = ''
  let cursor = 0

  while (cursor < text.length) {
    const open = findCharOutside(text, '(', cursor)
    if (open < 0) return result + text.slice(cursor)

    result += text.slice(cursor, open + 1)
    const close = findMatchingParen(text, open)
    if (close < 0) return result + text.slice(open + 1)

    const inside = text.slice(open + 1, close).trim()
    const nested = looksLikeQuery(inside) ? summarizeQuery(inside) : null
    result += nested ?? text.slice(open + 1, close)
    result += ')'
    cursor = close + 1
  }

  return result
}

function looksLikeQuery(text: string): boolean {
  const first = readFirstKeyword(stripOuterParentheses(text))
  return first === 'SELECT' || first === 'WITH'
}

function splitTopLevelUnion(text: string): Array<{ sql: string; operator?: string }> {
  const parts: Array<{ sql: string; operator?: string }> = []
  let start = 0
  let searchFrom = 0

  while (true) {
    const union = findKeyword(text, 'UNION', searchFrom, 0)
    if (!union) break

    const afterUnion = skipWhitespace(text, union.index + 5)
    const hasAll = readWordAt(text, afterUnion, 'ALL')
    const operatorEnd = hasAll ? afterUnion + 3 : union.index + 5
    parts.push({ sql: text.slice(start, union.index).trim(), operator: text.slice(union.index, operatorEnd).trim() })
    start = operatorEnd
    searchFrom = operatorEnd
  }

  if (!parts.length) return [{ sql: text }]
  parts.push({ sql: text.slice(start).trim() })
  return parts
}

function stripOuterParentheses(text: string): string {
  let result = text.trim()
  while (result.startsWith('(')) {
    const close = findMatchingParen(result, 0)
    if (close !== result.length - 1) break
    result = result.slice(1, -1).trim()
  }
  return result
}

function trimClosingWrapper(text: string): string {
  let trimmed = text.trim()
  if (trimmed.endsWith(';')) trimmed = trimmed.slice(0, -1).trimEnd()
  return trimmed.endsWith(')') ? trimmed.slice(0, -1).trimEnd() : trimmed
}

function readFirstKeyword(text: string): string | null {
  return /^([A-Z_][A-Z0-9_$#]*)\b/i.exec(text.trim())?.[1].toUpperCase() ?? null
}

function stripLeadingComments(text: string): string {
  let result = text.trimStart()
  while (true) {
    if (result.startsWith('--')) {
      const newline = result.indexOf('\n')
      if (newline < 0) return ''
      result = result.slice(newline + 1).trimStart()
      continue
    }
    if (result.startsWith('/*')) {
      const close = result.indexOf('*/', 2)
      if (close < 0) return ''
      result = result.slice(close + 2).trimStart()
      continue
    }
    return result
  }
}

function readWordAt(text: string, index: number, word: string): boolean {
  return text.slice(index, index + word.length).toUpperCase() === word &&
    !isWordChar(text[index - 1]) && !isWordChar(text[index + word.length])
}

function findKeyword(text: string, keyword: string, startIndex: number, requiredDepth?: number): KeywordHit | null {
  const upper = keyword.toUpperCase()
  let depth = 0
  let quote: "'" | '"' | null = null
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1 }
      continue
    }
    if (quote) {
      if (char === quote) {
        if (quote === "'" && next === "'") index += 1
        else quote = null
      }
      continue
    }
    if (char === '-' && next === '-') { lineComment = true; index += 1; continue }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === '(') { depth += 1; continue }
    if (char === ')') { depth = Math.max(0, depth - 1); continue }
    if (index < startIndex || (requiredDepth != null && depth !== requiredDepth)) continue
    if (text.slice(index, index + upper.length).toUpperCase() !== upper) continue
    if (isWordChar(text[index - 1]) || isWordChar(text[index + upper.length])) continue
    return { index, depth }
  }
  return null
}

function findCharOutside(text: string, needle: string, startIndex: number): number {
  let quote: "'" | '"' | null = null
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quote) {
      if (char === quote) {
        if (quote === "'" && next === "'") index += 1
        else quote = null
      }
      continue
    }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === needle) return index
  }
  return -1
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  let quote: "'" | '"' | null = null
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quote) {
      if (char === quote) {
        if (quote === "'" && next === "'") index += 1
        else quote = null
      }
      continue
    }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === '(') depth += 1
    if (char === ')' && --depth === 0) return index
  }
  return -1
}

function skipWhitespace(text: string, index: number): number {
  while (/\s/.test(text[index] ?? '')) index += 1
  return index
}

function countItems(segment: string): number {
  return Math.max(splitTopLevel(segment, ',').filter((item) => item.trim()).length, 1)
}

function splitTopLevel(segment: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: "'" | '"' | null = null
  let current = ''

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]
    const next = segment[index + 1]
    if (quote) {
      current += char
      if (char === quote) {
        if (quote === "'" && next === "'") { current += next; index += 1 }
        else quote = null
      }
      continue
    }
    if (char === "'" || char === '"') { quote = char; current += char; continue }
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === separator && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  parts.push(current)
  return parts
}

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Z0-9_$#]/i.test(char))
}

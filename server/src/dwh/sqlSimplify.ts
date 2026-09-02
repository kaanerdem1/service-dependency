type KeywordHit = {
  index: number
  depth: number
}

const MAX_SIMPLIFIED_LENGTH = 16000

export function simplifySql(sql: string | null | undefined): string | null {
  const text = sql?.trim()
  if (!text) return null

  const selectHit = findKeyword(text, 'SELECT', 0)
  if (!selectHit) return null
  const fromHit = findKeyword(text, 'FROM', selectHit.index + 'SELECT'.length, selectHit.depth)
  if (!fromHit) return null

  const selectList = text.slice(selectHit.index + 'SELECT'.length, fromHit.index)
  const expressionCount = countItems(selectList)
  if (expressionCount < 4 && text.length < MAX_SIMPLIFIED_LENGTH) return null

  const beforeSelect = simplifyInsertTarget(text.slice(0, selectHit.index))
  const fromOnward = text.slice(fromHit.index).trimStart()
  const simplified = `${beforeSelect}SELECT ...${expressionCount} ifade...\n${fromOnward}`.trim()
  return simplified !== text ? simplified : null
}

function simplifyInsertTarget(prefix: string) {
  const insertMatch = /^\s*insert\s+into\s+/i.exec(prefix)
  if (!insertMatch) return prefix.trimEnd() ? `${prefix.trimEnd()}\n` : ''

  const openIndex = findCharOutside(prefix, '(', insertMatch[0].length)
  if (openIndex < 0) return `${prefix.trimEnd()}\n`

  const closeIndex = findMatchingParen(prefix, openIndex)
  if (closeIndex < 0) return `${prefix.trimEnd()}\n`

  const target = prefix.slice(insertMatch[0].length, openIndex).trim()
  const columns = prefix.slice(openIndex + 1, closeIndex)
  const columnCount = countItems(columns)
  if (!target || columnCount < 4) return `${prefix.trimEnd()}\n`

  return `INSERT INTO ${target} ( ...${columnCount} kolon... )\n`
}

function findKeyword(text: string, keyword: string, startIndex: number, requiredDepth?: number): KeywordHit | null {
  const upperKeyword = keyword.toUpperCase()
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
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (char === quote) {
        if (quote === "'" && next === "'") {
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === '-' && next === '-') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (index < startIndex) continue
    if (requiredDepth != null && depth !== requiredDepth) continue
    if (text.slice(index, index + upperKeyword.length).toUpperCase() !== upperKeyword) continue

    const before = text[index - 1]
    const after = text[index + upperKeyword.length]
    if (isWordChar(before) || isWordChar(after)) continue
    return { index, depth }
  }

  return null
}

function findCharOutside(text: string, needle: string, startIndex: number) {
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
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === needle) return index
  }

  return -1
}

function findMatchingParen(text: string, openIndex: number) {
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
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function countItems(segment: string) {
  const items = splitTopLevel(segment, ',').map((item) => item.trim()).filter(Boolean)
  return Math.max(items.length, 1)
}

function splitTopLevel(segment: string, separator: string) {
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
        if (quote === "'" && next === "'") {
          current += next
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }

  parts.push(current)
  return parts
}

function isWordChar(char: string | undefined) {
  return Boolean(char && /[A-Z0-9_$#]/i.test(char))
}

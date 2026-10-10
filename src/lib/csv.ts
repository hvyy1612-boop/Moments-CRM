
export function csvCell(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delimiter = pickDelimiter(src.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const endField = () => {
    const value = field.trim()
    row.push(/^'[=+\-@]/.test(value) ? value.slice(1) : value)
    field = ''
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch !== '"') field += ch
      else if (src[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
    } else if (ch === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (ch === delimiter) {
      endField()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      endField()
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  endField()
  rows.push(row)
  return rows.filter((r) => r.some((c) => c !== ''))
}

function pickDelimiter(line: string): string {
  let tabs = 0
  let semis = 0
  let commas = 0
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '\t') tabs++
    else if (!quoted && ch === ';') semis++
    else if (!quoted && ch === ',') commas++
  }
  if (tabs > 0) return '\t'
  return semis > commas ? ';' : ','
}

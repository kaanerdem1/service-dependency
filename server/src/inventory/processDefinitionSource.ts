import fs from 'node:fs'
import path from 'node:path'

/** İsteğe bağlı: `105801-CRD_.../processdefinition.xml` dizinleri (deploy / lokal PAR). */
export function readProcessDefinitionXml(processNo: string): string | null {
  const root = process.env.PROCESS_PAR_ROOT?.trim()
  if (!root) return null
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return null
  }
  const dir = entries.find((d) => d.isDirectory() && d.name.startsWith(processNo))
  if (!dir) return null
  const xmlPath = path.join(root, dir.name, 'processdefinition.xml')
  try {
    return fs.readFileSync(xmlPath, 'utf8')
  } catch {
    return null
  }
}

import { db, cardsForDex, cardsForEntry } from './data'
import { compact } from './text'
import type { Card, Entry, NewOwned } from './types'

export type MatchStatus = 'found' | 'ambiguous' | 'unknown'

export interface ImportRow {
  line: number
  name: string
  entry: Entry | null
  ref: string
  note: string
  status: MatchStatus
  candidates: Card[]
  chosen: Card | null
}

// ---------- Lecture du fichier ----------
type Cell = string | number | boolean | null

export async function readWorkbook(file: File): Promise<Cell[][]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: false, defval: null })
}

function findColumns(header: Cell[]) {
  const h = header.map((c) => (c == null ? '' : compact(String(c))))
  const col = (re: RegExp) => h.findIndex((x) => re.test(x))
  return {
    name: col(/^nom/),
    owned: col(/^possede$/),
    ref: col(/^num/),
    serie: col(/^serie/),
    rarity: col(/^rarete/),
  }
}

// ---------- Numéros de carte ----------
interface Id {
  p: string
  n: number
  s: string
}
const splitId = (s: string): Id | null => {
  const m = s.toUpperCase().replace(/\s/g, '').match(/^([A-Z]*)0*(\d+)([A-Z]?)$/)
  return m ? { p: m[1], n: +m[2], s: m[3] } : null
}

/** "143/142 AR reverse" -> { left: "143", right: "142", note: "AR reverse" } */
export function parseRef(raw: string) {
  const m = raw.trim().match(/^([A-Za-z]{0,4}\s?\d+[a-zA-Z]?)\s*(?:\/\s*([A-Za-z]{0,3}\d+))?\s*(.*)$/)
  if (!m) return null
  return { left: m[1].replace(/\s/g, ''), right: m[2], note: m[3].trim() }
}

// Préfixe que tu écris pour les promos dont le numéro TCGdex est seulement numérique (svp-027 = "SVP27").
const PROMO_PREFIX: Record<string, string> = { svp: 'SVP', mep: 'MEP' }

/** Code d'extension de ton Excel -> id TCGdex ("EV7" -> "sv07", "EB12.5" -> "swsh12.5", "ME2" -> "me02"). */
function serieToSet(code: string): string | null {
  const c = code.toUpperCase().replace(/\s/g, '')
  const m = c.match(/^(EV|EB|ME|E)0?(\d+)(\.5)?$/)
  if (m) {
    const n = m[2]
    if (m[1] === 'EB') return `swsh${+n}${m[3] ?? ''}`
    return `${m[1] === 'ME' ? 'me' : 'sv'}${n.padStart(2, '0')}${m[3] ?? ''}`
  }
  return ({ SL: 'sm', XY: 'xy', HGSS: 'hgss', ECLIPSECOSMIQUE: 'sm12' } as Record<string, string>)[c] ?? null
}
const inSet = (setId: string, code: string) =>
  setId === code || (setId.startsWith(code) && /^[a-z]+$/.test(setId.slice(code.length)))

export const byLocal = (cards: Card[], left: string) => {
  const L = splitId(left)
  return cards.filter((c) => {
    const C = splitId(c.localId)
    if (!L || !C) return c.localId.toUpperCase() === left.toUpperCase()
    return C.n === L.n && C.s === L.s && (C.p === L.p || (C.p === '' && PROMO_PREFIX[c.setId] === L.p))
  })
}

export function matchCard(entry: Entry, ref: string, serie: string | null): { status: MatchStatus; candidates: Card[] } {
  const p = parseRef(ref)
  if (!p) return { status: 'unknown', candidates: [] }

  let found = byLocal(cardsForEntry(entry), p.left)
  if (!found.length) found = byLocal(cardsForDex(entry.dex), p.left)

  const R = p.right ? splitId(p.right) : null
  if (R && R.p === '' && found.length) {
    const sized = found.filter((c) => db.sets[c.setId]?.official === R.n || db.sets[c.setId]?.total === R.n)
    if (sized.length) found = sized
    else return { status: 'ambiguous', candidates: found }
  }
  if (found.length > 1 && serie) {
    const code = serieToSet(serie)
    const inS = code ? found.filter((c) => inSet(c.setId, code)) : []
    if (inS.length) found = inS
  }
  return { status: found.length === 1 ? 'found' : found.length ? 'ambiguous' : 'unknown', candidates: found }
}

// ---------- Analyse complète ----------
export function analyze(sheet: Cell[][]): { rows: ImportRow[]; notOwned: number; missingNames: string[]; error?: string } {
  const headerIdx = sheet.findIndex((r) => r.some((c) => c != null && /^nom/i.test(String(c).trim())))
  if (headerIdx < 0) return { rows: [], notOwned: 0, missingNames: [], error: 'Colonne "Nom" introuvable.' }
  const cols = findColumns(sheet[headerIdx])
  if (cols.owned < 0) return { rows: [], notOwned: 0, missingNames: [], error: 'Colonne "Possédé" introuvable.' }

  const byName = new Map(db.entries.map((e) => [compact(e.name), e]))
  const rows: ImportRow[] = []
  const missingNames: string[] = []
  let notOwned = 0
  const s = (r: Cell[], i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '')

  sheet.slice(headerIdx + 1).forEach((r, i) => {
    const name = s(r, cols.name)
    if (!name) return
    if (!/^oui/i.test(s(r, cols.owned))) return void notOwned++
    const entry = byName.get(compact(name.replace(/\s+/g, ' '))) ?? null
    if (!entry) return void missingNames.push(name)
    const ref = s(r, cols.ref)
    const serie = s(r, cols.serie) || null
    const rarity = s(r, cols.rarity)
    const parsed = parseRef(ref)
    const note = [parsed?.note, rarity].filter(Boolean).join(' · ')
    const { status, candidates } = ref ? matchCard(entry, ref, serie) : { status: 'unknown' as const, candidates: [] }
    rows.push({ line: headerIdx + i + 2, name, entry, ref, note, status, candidates, chosen: candidates[0] ?? null })
  })
  return { rows, notOwned, missingNames }
}

export function toOwned(r: ImportRow, makeRow: (e: Entry, c: Card | null, x: Partial<NewOwned>) => NewOwned): NewOwned {
  const card = r.status === 'unknown' ? null : r.chosen
  return makeRow(r.entry!, card, { raw_ref: r.ref || null, note: r.note || null })
}

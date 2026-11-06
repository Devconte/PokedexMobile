import type { Worker } from 'tesseract.js'
import { cardsForDex, db } from './data'
import { byLocal } from './importer'
import { compact } from './text'
import type { Card } from './types'

/** Une carte candidate et le numéro Pokédex sous lequel elle est indexée. */
export interface Hit {
  card: Card
  dex: number
}

export interface ScanResult {
  text: string
  /** Numéros lus sur la carte, ex. "TG03/TG30", "143/142", "SVP027". */
  numbers: string[]
  /** Pokémon reconnu dans le texte (nom en haut de la carte). */
  dex: number | null
  hits: Hit[]
}

// ---------- OCR (Tesseract.js, gratuit, tourne dans le téléphone) ----------
let worker: Promise<Worker> | null = null
function getWorker() {
  worker ??= (async () => {
    const { createWorker, PSM } = await import('tesseract.js')
    const w = await createWorker('eng')
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    return w
  })()
  return worker
}
/** Précharge le moteur (≈ quelques Mo la première fois, ensuite en cache). */
export const warmUp = () => void getWorker().catch(() => (worker = null))

async function ocr(canvas: HTMLCanvasElement) {
  const w = await getWorker()
  const { data } = await w.recognize(canvas)
  return data.text
}

/** Découpe une zone (en fractions de l'image), l'agrandit et la passe en niveaux de gris pour l'OCR. */
function zone(src: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, scale: number) {
  const c = document.createElement('canvas')
  const sw = src.width * w
  const sh = src.height * h
  c.width = Math.round(sw * scale)
  c.height = Math.round(sh * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.filter = 'grayscale(1) contrast(1.4)'
  ctx.drawImage(src, src.width * x, src.height * y, sw, sh, 0, 0, c.width, c.height)
  return c
}

const scaleFor = (px: number, target: number) => Math.min(4, Math.max(1, target / px))

/**
 * Lit une carte.
 * `framed` : l'image est déjà recadrée sur la carte (cadre de la caméra) -> on lit le nom (haut) et le numéro (bas).
 * Sinon (photo libre) on lit toute l'image.
 */
export async function scanImage(img: HTMLCanvasElement, framed: boolean): Promise<ScanResult> {
  let text: string
  if (framed) {
    const [top, bottom] = await Promise.all([
      ocr(zone(img, 0, 0, 1, 0.14, scaleFor(img.width, 1400))),
      // Le numéro est minuscule (≈ 8 px) : on agrandit fortement la bande du bas.
      ocr(zone(img, 0, 0.85, 1, 0.15, scaleFor(img.width, 2600))),
    ])
    text = `${top}\n${bottom}`
    const r = interpret(text)
    if (r.hits.length) return r
    text += '\n' + (await ocr(zone(img, 0, 0, 1, 1, scaleFor(img.width, 1400))))
  } else {
    text = await ocr(zone(img, 0, 0, 1, 1, scaleFor(img.width, 1600)))
  }
  return interpret(text)
}

// ---------- Interprétation du texte ----------
/** Corrige les confusions classiques de l'OCR dans un numéro (O -> 0, l -> 1…). */
const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/S(?=\d)/g, '5')

/** "TGO3" -> "TG03", "1O8" -> "108" : préfixe en lettres (max 4), puis chiffres. null si ce n'est pas un numéro. */
function token(raw: string): string | null {
  const m = raw.match(/^([A-Z]*?)([0-9OIL|][0-9OIL|]{0,2})([A-Z]?)$/)
  if (!m || m[1].length > 4) return null
  const num = digits(m[2])
  return /^\d+$/.test(num) ? m[1] + num + m[3] : null
}

export function findNumbers(text: string): string[] {
  const out = new Set<string>()
  const t = text.toUpperCase()
  // "143/142", "TG03/TG30", "SV107/SV122", "GG05/GG70"
  for (const m of t.matchAll(/(?<![A-Z0-9])([A-Z0-9|]{1,7})\s*\/\s*([A-Z0-9|]{1,7})(?![A-Z0-9])/g)) {
    const left = token(m[1])
    const right = token(m[2])
    if (left && right) out.add(`${left}/${right}`)
  }
  // Promos sans total : "SVP 027", "SWSH001", "SM60", "XY123"
  for (const m of t.matchAll(/\b(SVP|SWSH|SM|XY|BW|DP|HGSS|MEP)\s?-?\s?([0-9OIL|]{1,3})\b/g)) out.add(m[1] + digits(m[2]))
  return [...out]
}

/** Noms d'espèces, du plus long au plus court (pour reconnaître "Dracaufeu" avant "Draco"…). */
let names: { key: string; dex: number }[] | null = null
function speciesIndex() {
  if (!names) {
    const m = new Map<string, number>()
    for (const e of db.entries) for (const n of [e.name, e.species]) if (n && compact(n).length >= 4) m.set(compact(n), e.dex)
    names = [...m].map(([key, dex]) => ({ key, dex })).sort((a, b) => b.key.length - a.key.length)
  }
  return names
}

export function findDex(text: string): number | null {
  const t = compact(text)
  return speciesIndex().find((n) => t.includes(n.key))?.dex ?? null
}

let all: Hit[] | null = null
const allCards = () => (all ??= Object.keys(db.raw).flatMap((d) => cardsForDex(+d).map((card) => ({ card, dex: +d }))))

const PREFIXES = ['TG', 'GG', 'SV', 'RC', 'SWSH', 'SVP', 'SM', 'XY', 'BW', 'DP', 'HGSS', 'MEP', 'H']
const sameLenTypo = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length <= 1

/** Variantes d'un numéro mal lu : "NGO3/TG30" -> TG03 (préfixe du total), "NG03" -> TG03/GG03 (une lettre fausse). */
function variants(ref: string): string[] {
  const [left, right] = ref.split('/')
  const lp = left.match(/^[A-Z]*/)![0]
  const rest = left.slice(lp.length)
  const rp = right?.match(/^[A-Z]*/)![0] ?? ''
  const out = [ref]
  const add = (p: string) => out.push(p + rest + (right != null ? '/' + right : ''))
  if (rp && rp !== lp) add(rp)
  if (lp) for (const p of PREFIXES) if (p !== lp && sameLenTypo(p, lp)) add(p)
  if (lp && !PREFIXES.includes(lp) && !rp) add('') // lettre parasite devant un numéro simple
  return [...new Set(out)]
}

/** Cartes correspondant à un numéro ("TG03/TG30", "143/142", "SVP027"), éventuellement restreintes à un Pokémon. */
export function matchNumber(ref: string, dex: number | null): Hit[] {
  for (const v of variants(ref)) {
    const hits = matchExact(v, dex)
    if (hits.length) return hits
  }
  return []
}

function matchExact(ref: string, dex: number | null): Hit[] {
  const [left, right] = ref.split('/')
  const pool = dex != null ? (db.byDex.has(dex) ? cardsForDex(dex).map((card) => ({ card, dex })) : []) : allCards()
  const found = new Set(byLocal(pool.map((h) => h.card), left).map((c) => c.id))
  let hits = pool.filter((h) => found.has(h.card.id))
  if (right && hits.length > 1) {
    const n = +right.replace(/\D/g, '')
    const sized = hits.filter((h) => {
      const s = db.sets[h.card.setId]
      return s?.official === n || s?.total === n
    })
    if (sized.length) hits = sized
  }
  return hits
}

export function interpret(text: string): ScanResult {
  const numbers = findNumbers(text)
  const dex = findDex(text)
  const seen = new Set<string>()
  const hits: Hit[] = []
  const push = (list: Hit[]) => {
    for (const h of list) if (!seen.has(h.card.id)) (seen.add(h.card.id), hits.push(h))
  }
  // 1) numéro + Pokémon reconnu : le plus fiable. 2) numéro seul. 3) Pokémon seul : toutes ses cartes.
  if (dex != null) for (const n of numbers) push(matchNumber(n, dex))
  if (!hits.length) for (const n of numbers) push(matchNumber(n, null))
  if (!hits.length && dex != null) push(cardsForDex(dex).map((card) => ({ card, dex })))
  return { text, numbers, dex, hits: hits.slice(0, 60) }
}

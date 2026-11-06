import type { Worker } from 'tesseract.js'
import { cardsForDex, db } from './data'
import { compact } from './text'
import type { Card } from './types'

/** Une carte candidate et le numéro Pokédex sous lequel elle est indexée. */
export interface Hit {
  card: Card
  dex: number
  score: number
}

export interface ScanResult {
  text: string
  /** Numéros lus sur la carte, ex. "TG03/TG30", "143/142", "SVP027". */
  numbers: string[]
  /** Pokémon reconnu dans le texte (nom en haut de la carte). */
  dex: number | null
  hits: Hit[]
}

// =====================================================================
// OCR (Tesseract.js, gratuit, tourne dans le téléphone)
// =====================================================================
let worker: Promise<Worker> | null = null
function getWorker() {
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js')
    return createWorker('eng')
  })()
  return worker
}
/** Précharge le moteur (quelques Mo la première fois, ensuite en cache). */
export const warmUp = () => void getWorker().catch(() => (worker = null))

const NUM_CHARS = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** `numbers` : n'accepte que chiffres, majuscules et "/" (bien plus fiable pour lire "TG03/TG30"). */
async function ocr(canvas: HTMLCanvasElement, numbers = false) {
  const w = await getWorker()
  await w.setParameters({
    tessedit_pageseg_mode: '11' as never, // texte épars
    tessedit_char_whitelist: numbers ? NUM_CHARS : '',
  })
  const { data } = await w.recognize(canvas)
  return data.text
}

type Src = CanvasImageSource & { width: number; height: number }

/**
 * Découpe une zone (fractions de l'image), la met à l'échelle et la passe en niveaux de gris contrastés.
 * `targetW` : largeur visée en pixels (le numéro fait ~8 px sur une image basse définition : il faut agrandir).
 */
function zone(src: Src, x: number, y: number, w: number, h: number, targetW: number, threshold = false) {
  const sw = src.width * w
  const sh = src.height * h
  const k = Math.min(4, Math.max(0.5, targetW / sw))
  const c = document.createElement('canvas')
  c.width = Math.round(sw * k)
  c.height = Math.round(sh * k)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = 'grayscale(1) contrast(1.5)'
  ctx.drawImage(src, src.width * x, src.height * y, sw, sh, 0, 0, c.width, c.height)
  if (threshold) binarize(ctx, c.width, c.height)
  return c
}

/** Noir et blanc (seuil d'Otsu) : aide quand le numéro est sur un fond coloré. */
function binarize(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const hist = new Array(256).fill(0)
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++
  const total = w * h
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let t = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) (best = between), (t = i)
  }
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > t ? 255 : 0
  ctx.putImageData(img, 0, 0)
}

const strong = (r: ScanResult) => r.hits.length > 0 && r.hits.length <= 3 && r.hits[0].score >= 5

/**
 * Lit une carte.
 * `framed` : l'image est recadrée sur la carte (cadre de la caméra) -> nom en haut, numéro en bas.
 * Sinon (photo libre) : la carte peut être n'importe où, on lit l'image par bandes.
 * `onStep` : pour afficher la progression.
 */
export async function scanImage(img: HTMLCanvasElement, framed: boolean, onStep?: (s: string) => void): Promise<ScanResult> {
  let top = ''
  let rest = ''
  const done = () => interpret(rest, top)

  if (framed) {
    onStep?.('Lecture du nom…')
    top = await ocr(zone(img, 0, 0, 1, 0.14, 1400))
    // Le numéro est en bas à gauche (cartes récentes) ou à droite (anciennes).
    const passes: [number, number, boolean][] = [
      [0, 0.6, false],
      [0.4, 0.6, false],
      [0, 0.6, true],
      [0.4, 0.6, true],
    ]
    for (const [x, w, thr] of passes) {
      onStep?.('Lecture du numéro…')
      rest += '\n' + (await ocr(zone(img, x, 0.84, w, 0.16, 2200, thr), true))
      if (strong(done())) return done()
    }
    onStep?.('Lecture de toute la carte…')
    rest += '\n' + (await ocr(zone(img, 0, 0, 1, 1, 1600)))
    return done()
  }

  // Photo libre : une lecture d'ensemble (nom), puis des bandes horizontales en pleine définition (numéro).
  onStep?.('Lecture du nom…')
  top = await ocr(zone(img, 0, 0, 1, 1, Math.min(img.width, 1600)))
  const bands = 9
  for (let i = 0; i < bands; i++) {
    onStep?.(`Recherche du numéro (${i + 1}/${bands})…`)
    const y = 0.2 + i * 0.075
    rest += '\n' + (await ocr(zone(img, 0, y, 1, 0.12, Math.min(img.width, 2600)), true))
    if (strong(done())) break
  }
  return done()
}

// =====================================================================
// Interprétation du texte
// =====================================================================
/** Corrige les confusions classiques de l'OCR dans un numéro (O -> 0, l -> 1…). */
const digits = (s: string) => s.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/B/g, '8')

/** "TGO3" -> "TG03", "1O8" -> "108" : préfixe en lettres (4 max), puis chiffres. null si ce n'est pas un numéro. */
function token(raw: string): string | null {
  const m = raw.match(/^([A-Z]*?)([0-9OQDIL|][0-9OQDILZB|]{0,2})([A-Z]?)$/)
  if (!m || m[1].length > 4) return null
  const num = digits(m[2])
  return /^\d+$/.test(num) ? m[1] + num + m[3] : null
}

export function findNumbers(text: string): string[] {
  const out = new Set<string>()
  const t = text.toUpperCase()
  // "143/142", "TG03/TG30", "SV107/SV122", "GG05/GG70"
  for (const m of t.matchAll(/(?<![A-Z0-9])([A-Z0-9|]{1,7})\s*\/\s*([A-Z0-9|]{1,7})(?![A-Z0-9])/g)) {
    // Mot collé devant le numéro ("ELY557/191") : on ne garde que la fin.
    const left = token(m[1]) ?? token(m[1].slice(-4)) ?? token(m[1].slice(-3))
    const right = token(m[2]) ?? token(m[2].slice(0, 4)) ?? token(m[2].slice(0, 3))
    if (left && right) out.add(`${left}/${right}`)
  }
  // Promos sans total : "SVP 027", "SWSH001", "SM60", "XY123"
  for (const m of t.matchAll(/\b(SVP|SWSH|SM|XY|BW|DP|HGSS|MEP)\s?-?\s?([0-9OIL|]{1,3})\b/g)) out.add(m[1] + digits(m[2]))
  return [...out]
}

// ---------- Nom du Pokémon ----------
let names: { key: string; dex: number }[] | null = null
function speciesIndex() {
  if (!names) {
    const m = new Map<string, number>()
    for (const e of db.entries) for (const n of [e.name, e.species]) if (n && compact(n).length >= 4) m.set(compact(n), e.dex)
    // Du plus long au plus court : "Dracaufeu" avant "Draco".
    names = [...m].map(([key, dex]) => ({ key, dex })).sort((a, b) => b.key.length - a.key.length)
  }
  return names
}

function lev(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Pokémon nommé dans le texte. Tolère 1 faute (2 pour les noms longs) : "Dracaufcu" -> Dracaufeu. */
export function findDex(text: string): number | null {
  const t = compact(text)
  if (!t) return null
  const exact = speciesIndex().find((n) => n.key.length >= 4 && t.includes(n.key))
  if (exact) return exact.dex
  const words = text
    .split(/[^\p{L}]+/u)
    .map(compact)
    .filter((w) => w.length >= 5)
  for (const n of speciesIndex()) {
    if (n.key.length < 6) continue
    const max = n.key.length >= 9 ? 2 : 1
    for (const w of words) {
      if (w.length < n.key.length - max) continue
      if (lev(n.key, w.slice(0, n.key.length), max) <= max) return n.dex
    }
  }
  return null
}

// ---------- Correspondance avec les cartes ----------
interface Read {
  lp: string
  /** Préfixe du total ("TG30" -> "TG") : la carte doit avoir le même. */
  rp: string
  ln: number
  ld: string
  rn: number | null
}
/** Préfixes qui existent vraiment dans les numéros de cartes (TG, GG, SV, SWSH…), + ceux des promos. */
let prefixes: Set<string> | null = null
const knownPrefixes = () =>
  (prefixes ??= new Set([
    'SVP',
    'MEP',
    ...allCards()
      .map((h) => h.card.localId.toUpperCase().match(/^[A-Z]+/)?.[0])
      .filter((p): p is string => !!p),
  ]))

const parseRead = (ref: string): Read | null => {
  const [l, r] = ref.split('/')
  const m = l.match(/^([A-Z]*)0*(\d+)/)
  if (!m) return null
  const rn = r ? Number(r.replace(/\D/g, '')) || null : null
  // Lettres parasites devant le numéro ("ELY557") : on les ignore si ce n'est pas un vrai préfixe.
  const lp = knownPrefixes().has(m[1]) ? m[1] : ''
  const rpRaw = r?.match(/^[A-Z]*/)?.[0] ?? ''
  const rp = knownPrefixes().has(rpRaw) ? rpRaw : ''
  return { lp, rp, ln: +m[2], ld: m[2], rn }
}

/** Promos dont le numéro TCGdex est seulement numérique, mais imprimé avec un préfixe ("SVP 027" = svp-027). */
const PROMO_SET: Record<string, string> = { SVP: 'svp', MEP: 'mep' }

/** Les deux nombres ne diffèrent que d'un chiffre ("557" vs "057"). */
const oneDigitOff = (a: number, b: number) => {
  const x = String(a).padStart(3, '0')
  const y = String(b).padStart(3, '0')
  return x.length === y.length && [...x].filter((c, i) => c !== y[i]).length === 1
}

/**
 * Score d'une carte face aux numéros lus :
 * total de l'extension identique +3, numéro exact +4 (préfixe différent +2), numéro à un chiffre près +2.
 * Un total préfixé ("/TG30") exclut les cartes sans ce préfixe.
 */
function scoreCard(card: Card, reads: Read[]) {
  const s = db.sets[card.setId]
  const m = card.localId.toUpperCase().match(/^([A-Z]*)0*(\d+)/)
  if (!m) return 0
  const cp = m[1]
  const cn = +m[2]
  let best = 0
  for (const r of reads) {
    if (r.rp && cp !== r.rp) continue
    const promo = PROMO_SET[r.lp]
    if (promo && card.setId !== promo && cp !== r.lp) continue
    // lp vide = préfixe illisible ou absent : on n'en tient pas compte.
    const prefixOk = !r.lp || cp === r.lp || card.setId === promo
    let sc = 0
    if (r.rn && (s?.official === r.rn || s?.total === r.rn)) sc += 3
    if (cn === r.ln) sc += prefixOk ? 4 : 2
    else if (oneDigitOff(cn, r.ln) && prefixOk) sc += 2
    best = Math.max(best, sc)
  }
  return best
}

let all: { card: Card; dex: number }[] | null = null
const allCards = () => (all ??= Object.keys(db.raw).flatMap((d) => cardsForDex(+d).map((card) => ({ card, dex: +d }))))

/**
 * `text` : texte lu (surtout le numéro), `nameText` : zone du nom, prioritaire pour reconnaître le Pokémon.
 */
export function interpret(text: string, nameText = ''): ScanResult {
  const full = `${nameText}\n${text}`
  const numbers = findNumbers(full)
  const dex = findDex(nameText) ?? findDex(text)
  const reads = numbers.map(parseRead).filter((r): r is Read => !!r)

  const pool = dex != null ? cardsForDex(dex).map((card) => ({ card, dex })) : allCards()
  const scored = reads.length ? pool.map((h) => ({ ...h, score: scoreCard(h.card, reads) })) : []
  // Avec le nom : le total ou un numéro proche suffit. Sans le nom : il faut le numéro ET le total (ou un numéro exact).
  const min = dex != null ? 3 : 5
  let hits = scored.filter((h) => h.score >= min)
  if (!hits.length && dex == null) hits = scored.filter((h) => h.score >= 4)
  hits.sort((a, b) => b.score - a.score)
  // Ne garder que le meilleur niveau quand il est net (ex. une carte à 7 points et vingt à 3).
  if (hits.length && hits[0].score >= 6) hits = hits.filter((h) => h.score >= hits[0].score - 1)

  if (!hits.length && dex != null) hits = cardsForDex(dex).map((card) => ({ card, dex, score: 0 }))
  return { text: full.trim(), numbers, dex, hits: hits.slice(0, 60) }
}

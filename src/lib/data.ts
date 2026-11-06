import type { Card, Entry, SetInfo } from './types'
import { cardFitsForm, filterForEntry } from './forms'

const ASSETS = 'https://assets.tcgdex.net'
const API = 'https://api.tcgdex.net/v2/fr'

type RawCard = [id: string, localId: string, name: string, hasImage: 0 | 1]

export const db = {
  entries: [] as Entry[],
  byId: new Map<string, Entry>(),
  byDex: new Map<number, Entry[]>(),
  sets: {} as Record<string, SetInfo>,
  raw: {} as Record<string, RawCard[]>,
  meta: { updated: '', cards: 0 },
}

let loading: Promise<void> | null = null
export function loadData() {
  loading ??= (async () => {
    const get = (n: string) => fetch(`${import.meta.env.BASE_URL}data/${n}.json`).then((r) => r.json())
    const [entries, sets, raw, meta] = await Promise.all([get('pokedex'), get('sets'), get('cards'), get('meta')])
    db.entries = entries
    db.sets = sets
    db.raw = raw
    db.meta = meta
    for (const e of db.entries) {
      db.byId.set(e.id, e)
      if (!db.byDex.has(e.dex)) db.byDex.set(e.dex, [])
      db.byDex.get(e.dex)!.push(e)
    }
  })()
  return loading
}

export const setIdOf = (cardId: string, localId?: string) =>
  localId ? cardId.slice(0, cardId.length - localId.length - 1) : cardId.slice(0, cardId.lastIndexOf('-'))

function toCard([id, localId, name, hasImage]: RawCard): Card {
  const setId = setIdOf(id, localId)
  const serie = db.sets[setId]?.serie
  const path = serie ? `${serie}/${setId}/${localId}` : null
  return {
    id,
    localId,
    name,
    setId,
    img: path ? `${ASSETS}/${hasImage ? 'fr' : 'en'}/${path}` : null,
    fallback: path && hasImage ? `${ASSETS}/en/${path}` : null,
  }
}

const byDate = (a: Card, b: Card) =>
  (db.sets[b.setId]?.date ?? '').localeCompare(db.sets[a.setId]?.date ?? '') ||
  a.localId.localeCompare(b.localId, undefined, { numeric: true })

const dexCache = new Map<number, Card[]>()
/** Toutes les cartes FR d'un numéro Pokédex, de la plus récente à la plus ancienne. */
export function cardsForDex(dex: number): Card[] {
  if (!dexCache.has(dex)) dexCache.set(dex, (db.raw[dex] ?? []).map(toCard).sort(byDate))
  return dexCache.get(dex)!
}

export function cardsForEntry(entry: Entry, all = false, extra: Card[] = []): Card[] {
  const cards = [...extra, ...cardsForDex(entry.dex)]
  return all ? cards : filterForEntry(cards, entry, db.byDex.get(entry.dex) ?? [])
}

/** Case du Pokédex où ranger une carte : sa forme (Méga, Alola…) si elle a sa case, sinon le Pokémon de base. */
export function entryForCard(card: Pick<Card, 'name'>, dex: number): Entry | undefined {
  const list = db.byDex.get(dex) ?? []
  return list.find((e) => e.form !== 'base' && cardFitsForm(card.name, e.form, e.variant)) ?? list.find((e) => e.form === 'base') ?? list[0]
}

/** Nom affiché pour un numéro Pokédex (le Pokémon de base). */
export const speciesName = (dex: number) => {
  const list = db.byDex.get(dex) ?? []
  const e = list.find((x) => x.form === 'base') ?? list[0]
  return e ? (e.species ?? e.name) : `#${dex}`
}

const POCKET =/^(A\d|B\d|P-)/
/** Cartes sorties après la génération de l'index (interrogation en direct de l'API). */
export async function fetchNewCards(dex: number): Promise<Card[]> {
  try {
    const r = await fetch(`${API}/cards?dexId=eq:${dex}`)
    if (!r.ok) return []
    const list: { id: string; localId: string; name: string; image?: string }[] = await r.json()
    const known = new Set((db.raw[dex] ?? []).map((c) => c[0]))
    return list
      .filter((c) => !known.has(c.id))
      .filter((c) => !POCKET.test(setIdOf(c.id, c.localId)))
      .map((c) => ({ ...toCard([c.id, c.localId, c.name, c.image ? 1 : 0]), img: c.image ?? null, fallback: null }))
  } catch {
    return []
  }
}

/**
 * Image de secours sur pokemontcg.io (gratuit), pour les cartes sans image chez TCGdex (ex. Galeries de Dresseurs).
 * Les ids d'extension diffèrent un peu : "sm7.5" -> "sm75", "swsh12.5gg" -> "swsh12pt5gg", "sv3.5" -> "sv3pt5".
 */
export function ptcgImage(cardId: string, quality: 'low' | 'high' = 'low'): string | null {
  const i = cardId.lastIndexOf('-')
  if (i < 1) return null
  const set = cardId.slice(0, i).replace(/\.5/, (_m, _at, s: string) => (/^(swsh12|sv)/.test(s) ? 'pt5' : '5'))
  const num = cardId.slice(i + 1).replace(/^0+(?=\d)/, '')
  return `https://images.pokemontcg.io/${set}/${num}${quality === 'high' ? '_hires' : ''}.png`
}

export interface Price {
  trend: number | null
  low: number | null
  avg30: number | null
  /** Prix de la version reverse / holo quand Cardmarket les distingue. */
  holoTrend: number | null
  url: string
}

const priceCache = new Map<string, Promise<Price | null>>()
/** Prix Cardmarket (fournis gratuitement par TCGdex, mis à jour chaque jour). */
export function fetchPrice(card: Pick<Card, 'id' | 'name'>): Promise<Price | null> {
  if (!priceCache.has(card.id)) {
    priceCache.set(
      card.id,
      (async () => {
        try {
          const r = await fetch(`${API}/cards/${encodeURIComponent(card.id)}`)
          if (!r.ok) return null
          const cm = (await r.json()).pricing?.cardmarket
          const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null)
          return {
            trend: num(cm?.trend),
            low: num(cm?.low),
            avg30: num(cm?.avg30),
            holoTrend: num(cm?.['trend-holo']),
            url: cm?.idProduct
              ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${cm.idProduct}`
              : `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`,
          }
        } catch {
          return null
        }
      })(),
    )
  }
  return priceCache.get(card.id)!
}

export function cardLabel(c: Pick<Card, 'setId' | 'localId'>) {
  const s = db.sets[c.setId]
  const numeric = /^\d+$/.test(c.localId)
  const num = s?.official && numeric ? `${c.localId}/${String(s.official).padStart(c.localId.length, '0')}` : c.localId
  return { set: s?.name ?? c.setId, num, year: s?.date?.slice(0, 4) ?? '' }
}

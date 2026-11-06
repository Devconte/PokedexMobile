import type { Card, Entry, SetInfo } from './types'
import { filterForEntry } from './forms'

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

const POCKET = /^(A\d|B\d|P-)/
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

export function cardLabel(c: Pick<Card, 'setId' | 'localId'>) {
  const s = db.sets[c.setId]
  const numeric = /^\d+$/.test(c.localId)
  const num = s?.official && numeric ? `${c.localId}/${String(s.official).padStart(c.localId.length, '0')}` : c.localId
  return { set: s?.name ?? c.setId, num, year: s?.date?.slice(0, 4) ?? '' }
}

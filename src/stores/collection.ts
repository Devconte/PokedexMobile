import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '../lib/repo'
import type { Card, Entry, NewOwned, Owned } from '../lib/types'

export type Display = { kind: 'card'; img: string | null; fallback?: string | null } | { kind: 'unknown' }

export const useCollection = defineStore('collection', () => {
  const rows = ref<Owned[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  const byEntry = computed(() => {
    const m = new Map<string, Owned[]>()
    for (const r of rows.value) {
      if (!m.has(r.entry_id)) m.set(r.entry_id, [])
      m.get(r.entry_id)!.push(r)
    }
    return m
  })

  /** Ce qu'on affiche dans la case du Pokédex : carte mise en avant, sinon la dernière ajoutée. */
  const display = computed(() => {
    const m = new Map<string, Display>()
    for (const [entryId, list] of byEntry.value) {
      const withCard = list.filter((r) => r.card_id)
      const pick = withCard.find((r) => r.featured) ?? withCard[withCard.length - 1]
      m.set(entryId, pick ? { kind: 'card', img: pick.image } : { kind: 'unknown' })
    }
    return m
  })

  async function load() {
    error.value = null
    try {
      rows.value = await repo.list()
      loaded.value = true
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  function reset() {
    rows.value = []
    loaded.value = false
  }

  const fromCard = (entry: Entry, card: Card | null, extra: Partial<NewOwned> = {}): NewOwned => ({
    entry_id: entry.id,
    card_id: card?.id ?? null,
    card_name: card?.name ?? null,
    image: card?.img ?? null,
    raw_ref: null,
    note: null,
    featured: false,
    ...extra,
  })

  async function add(entry: Entry, card: Card | null, extra: Partial<NewOwned> = {}) {
    const [row] = await repo.insert([fromCard(entry, card, extra)])
    rows.value.push(row)
    return row
  }

  async function insertMany(list: NewOwned[]) {
    const added = await repo.insert(list)
    rows.value.push(...added)
  }

  async function remove(row: Owned) {
    await repo.remove([row.id])
    rows.value = rows.value.filter((r) => r.id !== row.id)
  }

  async function removeAll() {
    await repo.remove(rows.value.map((r) => r.id))
    rows.value = []
  }

  async function patch(row: Owned, p: Partial<NewOwned>) {
    await repo.update(row.id, p)
    Object.assign(rows.value.find((r) => r.id === row.id)!, p)
  }

  /** Met cette carte en avant dans le Pokédex (une seule par entrée). */
  async function feature(row: Owned) {
    for (const r of byEntry.value.get(row.entry_id) ?? []) if (r.featured && r.id !== row.id) await patch(r, { featured: false })
    await patch(row, { featured: true })
  }

  /** Associe une carte précise à une ligne "possédée mais non identifiée". */
  async function identify(row: Owned, card: Card) {
    await patch(row, { card_id: card.id, card_name: card.name, image: card.img })
  }

  return { rows, loaded, error, byEntry, display, load, reset, add, insertMany, remove, removeAll, patch, feature, identify, fromCard }
})

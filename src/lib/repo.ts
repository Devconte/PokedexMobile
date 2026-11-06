import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NewOwned, Owned } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Client Supabase, ou null en mode local (variables d'environnement absentes). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const isCloud = !!supabase

export interface Repo {
  list(): Promise<Owned[]>
  insert(rows: NewOwned[]): Promise<Owned[]>
  update(id: string, patch: Partial<NewOwned>): Promise<void>
  remove(ids: string[]): Promise<void>
}

const TABLE = 'owned_cards'
const COLS = 'id, entry_id, card_id, card_name, image, raw_ref, note, featured, created_at'

const cloudRepo = (sb: SupabaseClient): Repo => ({
  async list() {
    const out: Owned[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(TABLE).select(COLS).order('created_at').range(from, from + 999)
      if (error) throw error
      out.push(...(data as Owned[]))
      if (data.length < 1000) return out
    }
  },
  async insert(rows) {
    const out: Owned[] = []
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await sb.from(TABLE).insert(rows.slice(i, i + 500)).select(COLS)
      if (error) throw error
      out.push(...(data as Owned[]))
    }
    return out
  },
  async update(id, patch) {
    const { error } = await sb.from(TABLE).update(patch).eq('id', id)
    if (error) throw error
  },
  async remove(ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from(TABLE).delete().in('id', ids.slice(i, i + 200))
      if (error) throw error
    }
  },
})

const LS_KEY = 'pokedex-tcg:owned'
const localRepo = (): Repo => {
  const read = (): Owned[] => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    } catch {
      return []
    }
  }
  const write = (rows: Owned[]) => localStorage.setItem(LS_KEY, JSON.stringify(rows))
  return {
    async list() {
      return read()
    },
    async insert(rows) {
      const now = new Date().toISOString()
      const added = rows.map((r) => ({ ...r, id: crypto.randomUUID(), created_at: now }))
      write([...read(), ...added])
      return added
    },
    async update(id, patch) {
      write(read().map((r) => (r.id === id ? { ...r, ...patch } : r)))
    },
    async remove(ids) {
      const s = new Set(ids)
      write(read().filter((r) => !s.has(r.id)))
    },
  }
}

export const repo: Repo = supabase ? cloudRepo(supabase) : localRepo()

export type Form = 'base' | 'mega' | 'gmax' | 'alola' | 'galar' | 'hisui' | 'paldea' | 'primal'

/** Une case du Pokédex (un Pokémon ou une de ses formes). */
export interface Entry {
  id: string
  name: string
  dex: number
  gen: number
  form: Form
  variant?: 'X' | 'Y'
  /** Nom de l'espèce quand il diffère du nom de l'entrée. */
  species?: string
}

export interface SetInfo {
  name: string
  serie: string
  official?: number
  total?: number
  date?: string
  logo?: string
}

export interface Card {
  id: string
  localId: string
  name: string
  setId: string
  /** URL de base de l'image (sans /low.webp). */
  img: string | null
  /** Image de secours (version anglaise) si la FR n'existe pas. */
  fallback: string | null
}

/** Une carte possédée (ou "possédée mais non identifiée" si card_id est null). */
export interface Owned {
  id: string
  entry_id: string
  card_id: string | null
  card_name: string | null
  image: string | null
  raw_ref: string | null
  note: string | null
  featured: boolean
  created_at: string
}

export type NewOwned = Omit<Owned, 'id' | 'created_at'>

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '../lib/repo'
import { useAuth } from './auth'

const LS_KEY = 'pokedex-tcg:follows'

/**
 * Pokémon suivis (numéros Pokédex) : une page par Pokémon avec toutes ses cartes.
 * Compte Supabase : rangés dans les métadonnées de l'utilisateur (synchro sans table en plus).
 * Mode local : dans le navigateur.
 */
export const useFollows = defineStore('follows', () => {
  const auth = useAuth()
  const local = ref<number[]>(readLocal())

  const list = computed<number[]>(() =>
    supabase ? ((auth.session?.user.user_metadata?.follows as number[] | undefined) ?? []) : local.value,
  )
  const has = (dex: number) => list.value.includes(dex)

  async function save(next: number[]) {
    if (supabase) {
      const { data, error } = await supabase.auth.updateUser({ data: { follows: next } })
      if (error) throw error
      if (auth.session && data.user) auth.session = { ...auth.session, user: data.user }
    } else {
      local.value = next
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next))
      } catch {
        /* stockage indisponible : la liste reste en mémoire */
      }
    }
  }

  const toggle = (dex: number) => save(has(dex) ? list.value.filter((d) => d !== dex) : [...list.value, dex])

  return { list, has, toggle }
})

function readLocal(): number[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {
    return []
  }
}

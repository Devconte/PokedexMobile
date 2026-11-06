import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/repo'

export const useAuth = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const ready = ref(!supabase)

  async function init() {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    ready.value = true
    supabase.auth.onAuthStateChange((_e, s) => (session.value = s))
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase!.auth.signUp({ email, password })
    if (error) throw error
    return !!data.session // false = confirmation par e-mail requise
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  /** En mode local, pas de compte : on est toujours "connecté". */
  const isAuthed = () => !supabase || !!session.value

  return { session, ready, init, signIn, signUp, signOut, isAuthed }
})

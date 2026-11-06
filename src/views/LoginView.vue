<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useCollection } from '../stores/collection'

const auth = useAuth()
const col = useCollection()
const router = useRouter()
const mode = ref<'in' | 'up'>('in')
const email = ref('')
const password = ref('')
const error = ref('')
const info = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = info.value = ''
  try {
    if (mode.value === 'up') {
      const logged = await auth.signUp(email.value, password.value)
      if (!logged) {
        info.value = 'Compte créé ! Confirme ton adresse via l’e-mail reçu, puis connecte-toi.'
        mode.value = 'in'
        return
      }
    } else {
      await auth.signIn(email.value, password.value)
    }
    await col.load()
    router.replace('/')
  } catch (e) {
    error.value = (e as Error).message === 'Invalid login credentials' ? 'E-mail ou mot de passe incorrect.' : (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page login">
    <div class="logo">
      <img src="/pwa-192x192.png" alt="" width="72" height="72" />
      <h1>Pokédex TCG</h1>
      <p class="muted">Ton Pokédex, une carte à la fois.</p>
    </div>
    <form class="card-panel form" @submit.prevent="submit">
      <input v-model="email" class="input" type="email" autocomplete="email" placeholder="E-mail" required />
      <input
        v-model="password"
        class="input"
        type="password"
        :autocomplete="mode === 'in' ? 'current-password' : 'new-password'"
        placeholder="Mot de passe"
        minlength="6"
        required
      />
      <button class="btn primary block" :disabled="busy">{{ mode === 'in' ? 'Se connecter' : 'Créer mon compte' }}</button>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="info" class="ok">{{ info }}</p>
      <button type="button" class="btn block" @click="mode = mode === 'in' ? 'up' : 'in'">
        {{ mode === 'in' ? 'Pas de compte ? En créer un' : 'J’ai déjà un compte' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  max-width: 420px;
  padding-top: calc(var(--safe-t) + 48px);
}
.logo {
  text-align: center;
  margin-bottom: 20px;
}
.logo img {
  margin: 0 auto 8px;
  border-radius: 16px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form p {
  margin: 0;
  font-size: 0.9rem;
}
.error {
  color: #ff6b6b;
}
.ok {
  color: var(--ok);
}
</style>

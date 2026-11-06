<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/data'
import { isCloud } from '../lib/repo'
import type { NewOwned, Owned } from '../lib/types'
import { useAuth } from '../stores/auth'
import { useCollection } from '../stores/collection'

const auth = useAuth()
const col = useCollection()
const router = useRouter()
const msg = ref('')

function exportJson() {
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), rows: col.rows }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `pokedex-tcg-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function importJson(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text()) as { rows: Owned[] }
    if (!confirm(`Remplacer ta collection (${col.rows.length} cartes) par la sauvegarde (${data.rows.length} cartes) ?`)) return
    await col.removeAll()
    await col.insertMany(data.rows.map(({ id: _i, created_at: _c, ...r }) => r as NewOwned))
    msg.value = `✓ ${data.rows.length} cartes restaurées.`
  } catch (e) {
    msg.value = 'Erreur : ' + (e as Error).message
  }
}

async function logout() {
  await auth.signOut()
  col.reset()
  router.push('/login')
}
</script>

<template>
  <div class="page">
    <h1>Compte</h1>

    <div class="card-panel block">
      <template v-if="isCloud">
        <span class="muted small">Connecté en tant que</span>
        <b>{{ auth.session?.user.email }}</b>
        <span class="muted small">Ta collection est synchronisée sur tous tes appareils.</span>
        <button class="btn" @click="logout">Se déconnecter</button>
      </template>
      <template v-else>
        <b>Mode local</b>
        <span class="muted small">
          La collection est enregistrée sur cet appareil uniquement. Configure Supabase (voir le README) pour la synchro et les comptes.
        </span>
      </template>
    </div>

    <h2>Importer / sauvegarder</h2>
    <div class="card-panel block">
      <RouterLink to="/import" class="btn primary">Importer mon fichier Excel</RouterLink>
      <button class="btn" @click="exportJson">Exporter une sauvegarde (.json)</button>
      <label class="btn">
        Restaurer une sauvegarde
        <input type="file" accept=".json" hidden @change="importJson" />
      </label>
      <p v-if="msg" class="small">{{ msg }}</p>
    </div>

    <h2>Données</h2>
    <div class="card-panel block small muted">
      <span>{{ db.entries.length }} entrées dans le Pokédex · {{ db.meta.cards.toLocaleString('fr') }} cartes FR indexées</span>
      <span>Index mis à jour le {{ new Date(db.meta.updated).toLocaleDateString('fr') }} — les nouvelles cartes sont aussi récupérées en direct.</span>
      <span>Cartes et images : <a href="https://tcgdex.dev/fr" target="_blank" rel="noopener">TCGdex</a> · Illustrations : PokéAPI</span>
    </div>
  </div>
</template>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
a[target] {
  color: var(--accent);
}
</style>

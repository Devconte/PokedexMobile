<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EntryTile from '../components/EntryTile.vue'
import { db } from '../lib/data'
import { compact } from '../lib/text'
import { useCollection } from '../stores/collection'

const col = useCollection()
const q = ref('')
const status = ref<'all' | 'owned' | 'missing' | 'unknown'>('all')
const gen = ref(0)
const forms = ref(true)
const route = useRoute()
watch(
  () => route.query.f,
  (f) => {
    if (f === 'unknown') status.value = 'unknown'
  },
  { immediate: true },
)

const gens = [...new Set(db.entries.map((e) => e.gen))].sort((a, b) => a - b)
const indexed = db.entries.map((e) => ({ e, key: compact(e.name) + ' ' + compact(e.species ?? '') }))

const filtered = computed(() => {
  const s = compact(q.value)
  const num = /^\d+$/.test(q.value.trim()) ? +q.value.trim() : null
  return indexed
    .filter(({ e, key }) => {
      if (gen.value && e.gen !== gen.value) return false
      if (!forms.value && e.form !== 'base') return false
      const d = col.display.get(e.id)
      if (status.value === 'owned' && !d) return false
      if (status.value === 'missing' && d) return false
      if (status.value === 'unknown' && d?.kind !== 'unknown') return false
      if (num !== null) return e.dex === num
      return !s || key.includes(s)
    })
    .map((x) => x.e)
})

const owned = computed(() => db.entries.filter((e) => col.display.has(e.id)).length)
const pct = computed(() => Math.round((owned.value / db.entries.length) * 1000) / 10)
const unknownCount = computed(() => [...col.display.values()].filter((d) => d.kind === 'unknown').length)
</script>

<template>
  <div class="page">
    <header class="head">
      <div class="row">
        <h1>Pokédex</h1>
        <span class="count"><b>{{ owned }}</b> / {{ db.entries.length }} · {{ pct }}%</span>
      </div>
      <div class="bar"><i :style="{ width: pct + '%' }" /></div>
      <input v-model="q" class="input search" type="search" placeholder="Rechercher un Pokémon ou un n°…" enterkeyhint="search" />
      <div class="chips">
        <button class="chip" :class="{ on: status === 'all' }" @click="status = 'all'">Tous</button>
        <button class="chip" :class="{ on: status === 'owned' }" @click="status = 'owned'">Possédés</button>
        <button class="chip" :class="{ on: status === 'missing' }" @click="status = 'missing'">Manquants</button>
        <button v-if="unknownCount" class="chip" :class="{ on: status === 'unknown' }" @click="status = 'unknown'">À identifier ({{ unknownCount }})</button>
        <button class="chip" :class="{ on: forms }" @click="forms = !forms">Formes</button>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: gen === 0 }" @click="gen = 0">Toutes gén.</button>
        <button v-for="g in gens" :key="g" class="chip" :class="{ on: gen === g }" @click="gen = g">Gén. {{ g }}</button>
      </div>
    </header>

    <p v-if="col.error" class="muted">Erreur de chargement de la collection : {{ col.error }}</p>
    <p v-if="!filtered.length" class="muted">Aucun Pokémon ne correspond.</p>
    <div class="grid-cards">
      <EntryTile v-for="e in filtered" :key="e.id" :entry="e" />
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.count {
  color: var(--muted);
  font-size: 0.9rem;
}
.count b {
  color: var(--text);
}
</style>

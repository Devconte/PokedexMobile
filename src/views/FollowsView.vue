<script setup lang="ts">
import { computed, ref } from 'vue'
import { cardsForDex, db, speciesName } from '../lib/data'
import { artwork, compact, pad } from '../lib/text'
import { useCollection } from '../stores/collection'
import { useFollows } from '../stores/follows'

const col = useCollection()
const follows = useFollows()
const q = ref('')

const ownedIds = computed(() => new Set(col.rows.map((r) => r.card_id).filter(Boolean)))

const tracked = computed(() =>
  follows.list
    .filter((dex) => db.byDex.has(dex))
    .map((dex) => {
      const cards = cardsForDex(dex)
      const owned = cards.filter((c) => ownedIds.value.has(c.id)).length
      const pct = cards.length ? Math.round((owned / cards.length) * 100) : 0
      return { dex, name: speciesName(dex), owned, total: cards.length, pct }
    }),
)

/** Une ligne par espèce (les formes Méga, Alola… sont incluses dans la page du Pokémon). */
const species = [...db.byDex.keys()].sort((a, b) => a - b).map((dex) => {
  const names = (db.byDex.get(dex) ?? []).map((e) => compact(e.name) + ' ' + compact(e.species ?? '')).join(' ')
  return { dex, name: speciesName(dex), key: names }
})

const results = computed(() => {
  const s = compact(q.value)
  if (!s) return []
  const num = /^\d+$/.test(q.value.trim()) ? +q.value.trim() : null
  return species.filter((x) => (num !== null ? x.dex === num : x.key.includes(s))).slice(0, 20)
})
</script>

<template>
  <div class="page">
    <h1>Mes suivis</h1>
    <p class="muted small intro">Suis un Pokémon pour voir toutes ses cartes, celles que tu as et celles qui te manquent.</p>

    <input v-model="q" class="input" type="search" placeholder="Ajouter un Pokémon : nom ou n°…" enterkeyhint="search" />
    <div v-if="q" class="results">
      <p v-if="!results.length" class="muted small">Aucun Pokémon ne correspond.</p>
      <RouterLink v-for="r in results" :key="r.dex" :to="`/suivis/${r.dex}`" class="res">
        <img :src="artwork(r.dex)" alt="" loading="lazy" />
        <span>{{ r.name }} <span class="muted small">#{{ pad(r.dex) }}</span></span>
        <span v-if="follows.has(r.dex)" class="tag">Suivi</span>
      </RouterLink>
    </div>

    <p v-if="!tracked.length && !q" class="muted empty">Aucun Pokémon suivi pour l’instant. Cherche-en un ci-dessus, ou utilise « Toutes ses cartes » sur la fiche d’un Pokémon.</p>

    <div class="list">
      <RouterLink v-for="t in tracked" :key="t.dex" :to="`/suivis/${t.dex}`" class="card-panel item">
        <img :src="artwork(t.dex)" alt="" loading="lazy" />
        <div class="info">
          <div class="row">
            <b>{{ t.name }}</b>
            <span class="muted small">{{ t.owned }} / {{ t.total }}</span>
          </div>
          <div class="bar"><i :style="{ width: t.pct + '%' }" /></div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: -4px 0 12px;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 16px;
}
.res {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--surface);
}
.res img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.res > span:nth-child(2) {
  flex: 1;
}
.tag {
  font-size: 0.72rem;
  color: var(--ok);
  font-weight: 700;
}
.empty {
  margin-top: 20px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.item img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  flex: none;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
</style>

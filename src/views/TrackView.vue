<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CardImage from '../components/CardImage.vue'
import CardSheet from '../components/CardSheet.vue'
import { cardLabel, cardsForDex, db, entryForCard, fetchNewCards, speciesName } from '../lib/data'
import { artwork, pad } from '../lib/text'
import type { Card, Owned } from '../lib/types'
import { useCollection } from '../stores/collection'
import { useFollows } from '../stores/follows'

const route = useRoute()
const router = useRouter()
const col = useCollection()
const follows = useFollows()

const dex = computed(() => Number(route.params.dex))
const known = computed(() => db.byDex.has(dex.value))
const name = computed(() => speciesName(dex.value))
const live = ref<Card[]>([])
const filter = ref<'all' | 'missing' | 'owned'>('all')
const sheet = ref<Card | null>(null)
const busy = ref(false)
const err = ref('')

watch(
  dex,
  async (d) => {
    live.value = []
    filter.value = 'all'
    if (db.byDex.has(d)) live.value = await fetchNewCards(d)
  },
  { immediate: true },
)

/** Toutes les cartes du Pokémon, toutes formes confondues (Méga, Gigamax, Alola…). */
const all = computed(() => [...live.value, ...cardsForDex(dex.value)])

/** Une carte compte comme possédée quelle que soit la case du Pokédex où elle est rangée. */
const ownedByCard = computed(() => {
  const ids = new Set(all.value.map((c) => c.id))
  const m = new Map<string, Owned>()
  for (const r of col.rows) if (r.card_id && ids.has(r.card_id) && !m.has(r.card_id)) m.set(r.card_id, r)
  return m
})

const ownedCount = computed(() => all.value.filter((c) => ownedByCard.value.has(c.id)).length)
const pct = computed(() => (all.value.length ? Math.round((ownedCount.value / all.value.length) * 1000) / 10 : 0))

const shown = computed(() => {
  if (filter.value === 'owned') return all.value.filter((c) => ownedByCard.value.has(c.id))
  if (filter.value === 'missing') return all.value.filter((c) => !ownedByCard.value.has(c.id))
  return all.value
})

/** Regroupe par extension, dans l'ordre (de la plus récente à la plus ancienne). */
const groups = computed(() => {
  const m = new Map<string, Card[]>()
  for (const c of shown.value) {
    if (!m.has(c.setId)) m.set(c.setId, [])
    m.get(c.setId)!.push(c)
  }
  return [...m].map(([setId, cards]) => ({
    setId,
    name: db.sets[setId]?.name ?? setId,
    year: db.sets[setId]?.date?.slice(0, 4) ?? '',
    cards,
    owned: cards.filter((c) => ownedByCard.value.has(c.id)).length,
  }))
})

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  err.value = ''
  try {
    await fn()
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const sheetOwned = computed(() => (sheet.value ? (ownedByCard.value.get(sheet.value.id) ?? null) : null))
function add() {
  const card = sheet.value!
  const entry = entryForCard(card, dex.value)
  if (!entry) return
  return run(() => col.add(entry, card))
}
const remove = () => run(() => col.remove(sheetOwned.value!))
const feature = () => run(() => col.feature(sheetOwned.value!))
const setNote = (n: string) => run(() => col.patch(sheetOwned.value!, { note: n || null }))
const toggleFollow = () => run(() => follows.toggle(dex.value))

const back = () => (window.history.state?.back ? router.back() : router.push('/suivis'))
</script>

<template>
  <div v-if="!known" class="page">
    <p>Pokémon introuvable.</p>
    <RouterLink to="/suivis" class="btn">Retour aux suivis</RouterLink>
  </div>
  <div v-else class="page">
    <div class="top">
      <button class="btn" aria-label="Retour" @click="back">←</button>
      <img :src="artwork(dex)" alt="" class="mini" />
      <div class="title">
        <span class="muted small">#{{ pad(dex) }} · Toutes ses cartes</span>
        <h1>{{ name }}</h1>
      </div>
    </div>

    <div class="summary card-panel">
      <div class="row">
        <span><b>{{ ownedCount }}</b> / {{ all.length }} cartes</span>
        <span class="muted">{{ pct }}%</span>
      </div>
      <div class="bar"><i :style="{ width: pct + '%' }" /></div>
      <button class="btn" :class="{ primary: !follows.has(dex) }" :disabled="busy" @click="toggleFollow">
        {{ follows.has(dex) ? '✓ Suivi · ne plus suivre' : '+ Suivre ce Pokémon' }}
      </button>
      <p v-if="err" class="error">{{ err }}</p>
    </div>

    <div class="chips">
      <button class="chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">Toutes</button>
      <button class="chip" :class="{ on: filter === 'missing' }" @click="filter = 'missing'">Manquantes ({{ all.length - ownedCount }})</button>
      <button class="chip" :class="{ on: filter === 'owned' }" @click="filter = 'owned'">Possédées ({{ ownedCount }})</button>
    </div>

    <p v-if="!shown.length" class="muted">
      {{ filter === 'missing' ? 'Tu as toutes ses cartes, bravo !' : filter === 'owned' ? 'Aucune carte possédée pour l’instant.' : 'Aucune carte trouvée.' }}
    </p>

    <section v-for="g in groups" :key="g.setId" class="set">
      <h2 class="sethead">
        <span>{{ g.name }}<span v-if="g.year" class="muted"> · {{ g.year }}</span></span>
        <span class="muted small">{{ g.owned }}/{{ g.cards.length }}</span>
      </h2>
      <div class="grid-cards">
        <button v-for="c in g.cards" :key="c.id" class="cardbtn" :class="{ have: ownedByCard.has(c.id) }" @click="sheet = c">
          <div class="card-ratio">
            <CardImage :src="c.img" :fallback="c.fallback" :card-id="c.id" :alt="c.name" />
            <span v-if="ownedByCard.has(c.id)" class="check">✓</span>
          </div>
          <span class="cname">{{ c.name }}</span>
          <span class="cset muted">{{ cardLabel(c).num }}</span>
        </button>
      </div>
    </section>

    <CardSheet
      v-if="sheet"
      :card="sheet"
      :owned="sheetOwned"
      @close="sheet = null"
      @add="add"
      @remove="remove"
      @feature="feature"
      @note="setNote"
    />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mini {
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.title {
  min-width: 0;
}
.title h1 {
  margin: 0;
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 14px 0;
}
.row {
  display: flex;
  justify-content: space-between;
}
.set {
  margin-top: 18px;
}
.sethead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 0.95rem;
  margin: 0 0 8px;
}
.cardbtn {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cardbtn .card-ratio {
  outline: 2px solid transparent;
  outline-offset: 1px;
}
/* Les cartes manquantes sont grisées. */
.cardbtn:not(.have) .card-ratio :deep(img) {
  filter: grayscale(1);
  opacity: 0.45;
}
.cardbtn.have .card-ratio {
  outline-color: var(--ok);
}
.check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  font-weight: 800;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
}
.cname {
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cset {
  font-size: 0.7rem;
}
.error {
  color: #ff6b6b;
  margin: 0;
}
</style>

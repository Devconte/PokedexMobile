<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CardImage from '../components/CardImage.vue'
import CardSheet from '../components/CardSheet.vue'
import { cardLabel, cardsForEntry, db, fetchNewCards } from '../lib/data'
import { FORM_LABEL } from '../lib/forms'
import { artwork, pad } from '../lib/text'
import type { Card, Owned } from '../lib/types'
import { useCollection } from '../stores/collection'
import { useFollows } from '../stores/follows'

const follows = useFollows()
const route = useRoute()
const router = useRouter()
const col = useCollection()

const entry = computed(() => db.byId.get(route.params.id as string) ?? null)
const showAll = ref(false)
const onlyOwned = ref(false)
const live = ref<Card[]>([])
const busy = ref(false)
const err = ref('')
// Fiche d'une carte / mode "identifier"
const sheet = ref<Card | null>(null)
const pickFor = ref<Owned | null>(null)

watch(
  entry,
  async (e) => {
    live.value = []
    showAll.value = false
    pickFor.value = null
    if (e) live.value = await fetchNewCards(e.dex)
  },
  { immediate: true },
)

const owned = computed(() => (entry.value ? (col.byEntry.get(entry.value.id) ?? []) : []))
const ownedByCard = computed(() => new Map(owned.value.filter((r) => r.card_id).map((r) => [r.card_id!, r])))
const unknown = computed(() => owned.value.filter((r) => !r.card_id))

const cards = computed(() => {
  if (!entry.value) return []
  let list = cardsForEntry(entry.value, showAll.value, live.value)
  // Les cartes possédées hors filtre de forme restent visibles.
  const ids = new Set(list.map((c) => c.id))
  const extra = cardsForEntry(entry.value, true, live.value).filter((c) => !ids.has(c.id) && ownedByCard.value.has(c.id))
  list = [...extra, ...list]
  const mine = list.filter((c) => ownedByCard.value.has(c.id))
  return onlyOwned.value ? mine : [...mine, ...list.filter((c) => !ownedByCard.value.has(c.id))]
})
const hiddenCount = computed(() => (entry.value ? cardsForEntry(entry.value, true, live.value).length - cardsForEntry(entry.value, false, live.value).length : 0))

const hero = computed(() => col.display.get(entry.value?.id ?? ''))
const form = computed(() => (entry.value ? FORM_LABEL[entry.value.form] + (entry.value.variant ? ` ${entry.value.variant}` : '') : ''))

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

function onCard(c: Card) {
  if (pickFor.value) {
    const row = pickFor.value
    pickFor.value = null
    if (ownedByCard.value.has(c.id)) return run(() => col.remove(row)) // déjà là : on supprime le doublon
    return run(() => col.identify(row, c))
  }
  sheet.value = c
}

const sheetOwned = computed(() => (sheet.value ? (ownedByCard.value.get(sheet.value.id) ?? null) : null))
const add = () => run(() => col.add(entry.value!, sheet.value!))
const remove = () => run(() => col.remove(sheetOwned.value!))
const feature = () => run(() => col.feature(sheetOwned.value!))
const setNote = (n: string) => run(() => col.patch(sheetOwned.value!, { note: n || null }))
const addUnknown = () => run(() => col.add(entry.value!, null))

const back = () => (window.history.state?.back ? router.back() : router.push('/'))

const neighbors = computed(() => {
  const i = db.entries.findIndex((e) => e.id === entry.value?.id)
  return { prev: db.entries[i - 1], next: db.entries[i + 1] }
})
</script>

<template>
  <div v-if="!entry" class="page">
    <p>Pokémon introuvable.</p>
    <RouterLink to="/" class="btn">Retour au Pokédex</RouterLink>
  </div>
  <div v-else class="page">
    <div class="top">
      <button class="btn" aria-label="Retour" @click="back">←</button>
      <div class="title">
        <span class="muted small">#{{ pad(entry.dex) }} · Gén. {{ entry.gen }}<template v-if="form"> · {{ form }}</template></span>
        <h1>{{ entry.name }}</h1>
      </div>
    </div>

    <section class="hero">
      <div class="card-ratio heroimg">
        <CardImage v-if="hero?.kind === 'card'" :src="hero.img" :card-id="hero.cardId" quality="high" :alt="entry.name" />
        <img v-else :src="artwork(entry.dex)" :alt="entry.name" class="art" :class="{ ghost: !hero }" />
      </div>
      <div class="herotext">
        <p v-if="!hero" class="muted">Pas encore dans ta collection.</p>
        <p v-else>
          <b>{{ owned.length }}</b> carte{{ owned.length > 1 ? 's' : '' }} possédée{{ owned.length > 1 ? 's' : '' }}
        </p>
        <div v-for="r in unknown" :key="r.id" class="unk">
          <span>? Carte non identifiée<template v-if="r.raw_ref"> · <b>{{ r.raw_ref }}</b></template><template v-if="r.note"> · {{ r.note }}</template></span>
          <div class="unk-actions">
            <button class="btn" :class="{ primary: pickFor?.id === r.id }" @click="pickFor = pickFor?.id === r.id ? null : r">
              {{ pickFor?.id === r.id ? 'Annuler' : 'Identifier' }}
            </button>
            <button class="btn danger" aria-label="Supprimer" @click="run(() => col.remove(r))">✕</button>
          </div>
        </div>
        <button v-if="!unknown.length" class="btn small" :disabled="busy" @click="addUnknown">J'en ai une, mais je ne sais pas laquelle</button>
        <RouterLink :to="`/suivis/${entry.dex}`" class="btn small">
          Toutes ses cartes →<template v-if="follows.has(entry.dex)"> (suivi)</template>
        </RouterLink>
        <p v-if="err" class="error">{{ err }}</p>
      </div>
    </section>

    <div v-if="pickFor" class="pickbar">Touche la carte qui correspond à « {{ pickFor.raw_ref || 'ta carte' }} »</div>

    <div class="cards-head">
      <h2>Cartes disponibles <span class="muted">({{ cards.length }})</span></h2>
    </div>
    <div class="chips">
      <button class="chip" :class="{ on: onlyOwned }" @click="onlyOwned = !onlyOwned">Possédées</button>
      <button v-if="hiddenCount > 0" class="chip" :class="{ on: showAll }" @click="showAll = !showAll">
        Toutes les cartes #{{ entry.dex }} (+{{ hiddenCount }})
      </button>
    </div>

    <p v-if="!cards.length" class="muted">Aucune carte trouvée pour cette forme. <button v-if="hiddenCount" class="chip" @click="showAll = true">Tout afficher</button></p>
    <div class="grid-cards list">
      <button v-for="c in cards" :key="c.id" class="cardbtn" :class="{ have: ownedByCard.has(c.id), picking: pickFor }" @click="onCard(c)">
        <div class="card-ratio">
          <CardImage :src="c.img" :fallback="c.fallback" :card-id="c.id" :alt="c.name" />
          <span v-if="ownedByCard.has(c.id)" class="check">{{ ownedByCard.get(c.id)!.featured ? '★' : '✓' }}</span>
        </div>
        <span class="cname">{{ c.name }}</span>
        <span class="cset muted">{{ cardLabel(c).set }} · {{ cardLabel(c).num }}</span>
      </button>
    </div>

    <nav class="neigh">
      <RouterLink v-if="neighbors.prev" :to="`/p/${neighbors.prev.id}`" class="btn">← {{ neighbors.prev.name }}</RouterLink>
      <span />
      <RouterLink v-if="neighbors.next" :to="`/p/${neighbors.next.id}`" class="btn">{{ neighbors.next.name }} →</RouterLink>
    </nav>

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
  gap: 12px;
}
.title h1 {
  margin: 0;
}
.hero {
  display: flex;
  gap: 16px;
  margin: 16px 0;
  align-items: flex-start;
}
.heroimg {
  width: 42%;
  max-width: 260px;
  flex: none;
  border-radius: 10px;
}
.art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 12%;
}
.art.ghost {
  filter: grayscale(1) brightness(0.55);
  opacity: 0.5;
}
.herotext {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.herotext p {
  margin: 0;
}
.unk {
  background: var(--surface);
  border: 1px solid var(--warn);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.unk-actions {
  display: flex;
  gap: 6px;
}
.unk-actions .btn:first-child {
  flex: 1;
}
.pickbar {
  position: sticky;
  top: calc(var(--safe-t) + 8px);
  z-index: 5;
  background: var(--warn);
  color: #000;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 8px;
}
.cards-head h2 {
  margin-bottom: 8px;
}
.list {
  margin-top: 12px;
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
.cardbtn.have .card-ratio {
  outline-color: var(--ok);
}
.cardbtn.picking .card-ratio {
  outline-color: var(--warn);
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.neigh {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 28px;
}
.neigh .btn {
  font-size: 0.8rem;
  max-width: 48%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.error {
  color: #ff6b6b;
}
</style>

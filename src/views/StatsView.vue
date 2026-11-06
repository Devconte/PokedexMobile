<script setup lang="ts">
import { computed } from 'vue'
import { db, setIdOf } from '../lib/data'
import { FORM_LABEL } from '../lib/forms'
import type { Entry, Form } from '../lib/types'
import { useCollection } from '../stores/collection'

const col = useCollection()

const has = (e: Entry) => col.display.has(e.id)
function group<K>(key: (e: Entry) => K) {
  const m = new Map<K, { total: number; owned: number }>()
  for (const e of db.entries) {
    const k = key(e)
    if (!m.has(k)) m.set(k, { total: 0, owned: 0 })
    const g = m.get(k)!
    g.total++
    if (has(e)) g.owned++
  }
  return m
}
const pct = (o: number, t: number) => (t ? Math.round((o / t) * 1000) / 10 : 0)

const total = computed(() => {
  const owned = db.entries.filter(has).length
  return { owned, total: db.entries.length, pct: pct(owned, db.entries.length) }
})
const species = computed(() => {
  const all = new Set(db.entries.map((e) => e.dex))
  const owned = new Set(db.entries.filter(has).map((e) => e.dex))
  return { owned: owned.size, total: all.size, pct: pct(owned.size, all.size) }
})
const byGen = computed(() => [...group((e) => e.gen)].sort((a, b) => a[0] - b[0]))
const byForm = computed(() => [...group((e) => e.form)].filter(([f]) => f !== 'base') as [Form, { total: number; owned: number }][])

const cards = computed(() => col.rows.filter((r) => r.card_id).length)
const unknown = computed(() => col.rows.filter((r) => !r.card_id))

const topSets = computed(() => {
  const m = new Map<string, number>()
  for (const r of col.rows) if (r.card_id) m.set(setIdOf(r.card_id), (m.get(setIdOf(r.card_id)) ?? 0) + 1)
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, n]) => ({ id, n, name: db.sets[id]?.name ?? id, logo: db.sets[id]?.logo }))
})
const maxSet = computed(() => topSets.value[0]?.n ?? 1)
</script>

<template>
  <div class="page">
    <h1>Statistiques</h1>

    <div class="kpis">
      <div class="card-panel kpi">
        <span class="muted small">Pokédex</span>
        <b>{{ total.pct }}%</b>
        <span class="small">{{ total.owned }} / {{ total.total }} cases</span>
      </div>
      <div class="card-panel kpi">
        <span class="muted small">Espèces</span>
        <b>{{ species.pct }}%</b>
        <span class="small">{{ species.owned }} / {{ species.total }}</span>
      </div>
      <div class="card-panel kpi">
        <span class="muted small">Cartes</span>
        <b>{{ cards }}</b>
        <span class="small">identifiées</span>
      </div>
      <div class="card-panel kpi">
        <span class="muted small">À identifier</span>
        <b :class="{ warn: unknown.length }">{{ unknown.length }}</b>
        <RouterLink v-if="unknown.length" to="/?f=unknown" class="small link">voir</RouterLink>
        <span v-else class="small">✓</span>
      </div>
    </div>

    <h2>Par génération</h2>
    <div class="card-panel rows">
      <div v-for="[g, s] in byGen" :key="g" class="r">
        <span class="lbl">Gén. {{ g }}</span>
        <div class="bar"><i :style="{ width: pct(s.owned, s.total) + '%' }" /></div>
        <span class="val">{{ s.owned }}/{{ s.total }}</span>
      </div>
    </div>

    <h2>Formes spéciales</h2>
    <div class="card-panel rows">
      <div v-for="[f, s] in byForm" :key="f" class="r">
        <span class="lbl">{{ FORM_LABEL[f] }}</span>
        <div class="bar"><i :style="{ width: pct(s.owned, s.total) + '%' }" /></div>
        <span class="val">{{ s.owned }}/{{ s.total }}</span>
      </div>
    </div>

    <template v-if="topSets.length">
      <h2>Extensions les plus présentes</h2>
      <div class="card-panel rows">
        <div v-for="s in topSets" :key="s.id" class="r">
          <span class="lbl set">{{ s.name }}</span>
          <div class="bar"><i :style="{ width: (s.n / maxSet) * 100 + '%' }" /></div>
          <span class="val">{{ s.n }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 12px;
}
@media (min-width: 700px) {
  .kpis {
    grid-template-columns: repeat(4, 1fr);
  }
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kpi b {
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
}
.warn {
  color: var(--warn);
}
.link {
  color: var(--accent);
  font-weight: 600;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.r {
  display: grid;
  grid-template-columns: minmax(80px, 140px) 1fr 64px;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}
.lbl.set {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.val {
  text-align: right;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>

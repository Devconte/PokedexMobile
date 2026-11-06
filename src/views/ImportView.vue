<script setup lang="ts">
import { computed, ref } from 'vue'
import CardImage from '../components/CardImage.vue'
import { cardLabel } from '../lib/data'
import { analyze, readWorkbook, toOwned, type ImportRow, type MatchStatus } from '../lib/importer'
import { useCollection } from '../stores/collection'

const col = useCollection()
const rows = ref<ImportRow[]>([])
const notOwned = ref(0)
const missing = ref<string[]>([])
const error = ref('')
const loading = ref(false)
const tab = ref<MatchStatus>('ambiguous')
const replace = ref(false)
const done = ref('')

async function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  loading.value = true
  error.value = done.value = ''
  try {
    const res = analyze(await readWorkbook(file))
    if (res.error) throw new Error(res.error)
    rows.value = res.rows
    notOwned.value = res.notOwned
    missing.value = res.missingNames
    tab.value = count('ambiguous') ? 'ambiguous' : 'unknown'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const count = (s: MatchStatus) => rows.value.filter((r) => r.status === s).length
const shown = computed(() => rows.value.filter((r) => r.status === tab.value))
const TABS: { s: MatchStatus; label: string }[] = [
  { s: 'ambiguous', label: 'À vérifier' },
  { s: 'unknown', label: 'Non identifiées' },
  { s: 'found', label: 'Trouvées' },
]

function choose(r: ImportRow, id: string) {
  r.chosen = r.candidates.find((c) => c.id === id) ?? null
  if (r.chosen && r.status === 'unknown') r.status = 'found'
}
function setUnknown(r: ImportRow) {
  r.status = 'unknown'
  r.chosen = null
}

async function confirm() {
  loading.value = true
  error.value = ''
  try {
    if (replace.value) await col.removeAll()
    // En mode fusion, on ne recrée pas une carte déjà présente.
    const existing = new Set(col.rows.map((r) => `${r.entry_id}|${r.card_id ?? 'raw:' + r.raw_ref}`))
    const seen = new Set<string>()
    const list = rows.value
      .map((r) => toOwned(r, col.fromCard))
      .filter((o) => {
        const k = `${o.entry_id}|${o.card_id ?? 'raw:' + o.raw_ref}`
        if (existing.has(k) || seen.has(k)) return false
        seen.add(k)
        return true
      })
    await col.insertMany(list)
    done.value = `${list.length} cartes importées.`
    rows.value = []
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <RouterLink to="/compte" class="muted small">← Compte</RouterLink>
    <h1>Importer mon Excel</h1>
    <p class="muted small">
      Premier onglet, avec les colonnes <b>Nom Pokémon</b>, <b>Possédé</b>, <b>Num carte possédée</b> et, si possible, <b>Série carte</b> et
      <b>Rareté</b>. Les cartes sont retrouvées grâce au numéro (ex. 143/142, SVP27, TG01/TG30).
    </p>

    <label class="btn primary block file">
      {{ loading ? 'Analyse…' : 'Choisir le fichier .xlsx' }}
      <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onFile" />
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="done" class="ok">✓ {{ done }} <RouterLink to="/" class="link">Voir le Pokédex</RouterLink></p>

    <template v-if="rows.length">
      <div class="card-panel summary">
        <div><b class="ok">{{ count('found') }}</b> trouvées</div>
        <div><b class="warn">{{ count('ambiguous') }}</b> à vérifier</div>
        <div><b>{{ count('unknown') }}</b> non identifiées</div>
        <div class="muted small full">
          Les cartes non identifiées sont importées comme « possédée, carte à identifier » : le Pokémon compte comme possédé et tu choisiras la carte plus tard.
          <template v-if="missing.length"><br />Noms non reconnus (ignorés) : {{ missing.join(', ') }}</template>
        </div>
      </div>

      <div class="chips tabs">
        <button v-for="t in TABS" :key="t.s" class="chip" :class="{ on: tab === t.s }" @click="tab = t.s">{{ t.label }} ({{ count(t.s) }})</button>
      </div>

      <div class="list">
        <div v-for="r in shown.slice(0, 300)" :key="r.line" class="item card-panel">
          <div class="thumb card-ratio"><CardImage v-if="r.chosen" :src="r.chosen.img" :fallback="r.chosen.fallback" /></div>
          <div class="info">
            <b>{{ r.name }}</b>
            <span class="small">Excel : <code>{{ r.ref || '—' }}</code><template v-if="r.note"> · {{ r.note }}</template></span>
            <span v-if="r.chosen" class="small muted">{{ r.chosen.name }} · {{ cardLabel(r.chosen).set }} {{ cardLabel(r.chosen).num }}</span>
            <select v-if="r.candidates.length > 1" class="input small" :value="r.chosen?.id" @change="choose(r, ($event.target as HTMLSelectElement).value)">
              <option v-for="c in r.candidates" :key="c.id" :value="c.id">{{ c.name }} — {{ cardLabel(c).set }} {{ cardLabel(c).num }}</option>
            </select>
            <div v-if="r.status !== 'unknown'" class="row-actions">
              <button v-if="r.status === 'ambiguous'" class="chip" @click="r.status = 'found'">✓ C'est bien elle</button>
              <button class="chip" @click="setUnknown(r)">Pas la bonne</button>
            </div>
          </div>
        </div>
        <p v-if="shown.length > 300" class="muted small">… et {{ shown.length - 300 }} autres.</p>
      </div>

      <div class="confirm card-panel">
        <label class="check"><input v-model="replace" type="checkbox" /> Remplacer ma collection actuelle ({{ col.rows.length }} cartes)</label>
        <button class="btn primary block" :disabled="loading" @click="confirm">Importer {{ rows.length }} cartes</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file {
  margin: 12px 0;
  cursor: pointer;
}
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}
.summary .full {
  grid-column: 1 / -1;
  text-align: left;
}
.summary b {
  font-size: 1.4rem;
  display: block;
}
.tabs {
  margin: 14px 0 10px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: flex;
  gap: 12px;
  padding: 10px;
}
.thumb {
  width: 64px;
  flex: none;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.row-actions {
  display: flex;
  gap: 6px;
}
.confirm {
  position: sticky;
  bottom: calc(var(--nav-h) + var(--safe-b) + 8px);
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.9rem;
}
.ok {
  color: var(--ok);
}
.warn {
  color: var(--warn);
}
.error {
  color: #ff6b6b;
}
.link {
  color: var(--accent);
  font-weight: 600;
}
code {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>

// Génère public/data/pokedex.json (liste des entrées) et public/data/sets.json (index des extensions TCGdex).
// Usage : node scripts/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://api.tcgdex.net/v2/fr'
const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/^﻿/, '')

// ---------- Normalisation ----------
const norm = (s) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{Mn}/gu, '')
const compact = (s) => norm(s).replace(/[^a-z0-9♀♂]/g, '')
const slug = (s) => norm(s).replace(/[♀]/g, 'f').replace(/[♂]/g, 'm').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// ---------- Espèces (PokéAPI CSV) ----------
const parseCsv = (txt) => {
  const [head, ...rows] = txt.trim().split(/\r?\n/)
  const cols = head.split(',')
  return rows.map((r) => {
    const v = r.split(',')
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]))
  })
}
const species = new Map() // id -> { name, gen }
for (const r of parseCsv(read('data/pokemon_species.csv'))) species.set(+r.id, { gen: +r.generation_id })
for (const r of parseCsv(read('data/species_names.csv')))
  if (r.local_language_id === '5' && species.has(+r.pokemon_species_id)) species.get(+r.pokemon_species_id).name = r.name
const byCompact = new Map([...species].map(([id, s]) => [compact(s.name), id]))
const speciesList = [...species].map(([id, s]) => ({ id, c: compact(s.name) })).sort((a, b) => b.c.length - a.c.length)

// Corrections manuelles éventuelles : nom Excel -> numéro Pokédex
const MANUAL = { 'Orpegon(Puits)': 1017 }

// ---------- Détection de forme ----------
function detectForm(name) {
  const n = norm(name)
  if (/\bprimo\b/.test(n)) return { form: 'primal' }
  if (/\bmega\b|\(mega\)/.test(n)) {
    const v = n.match(/\b([xy])\s*$/)
    return { form: 'mega', variant: v ? v[1].toUpperCase() : undefined }
  }
  if (/giga\s*max|gigama\b|gimamax|\bv\s*max\b/.test(n)) return { form: 'gmax' }
  if (/alola/.test(n)) return { form: 'alola' }
  if (/galar/.test(n)) return { form: 'galar' }
  if (/hisui/.test(n)) return { form: 'hisui' }
  if (/paldea/.test(n)) return { form: 'paldea' }
  return { form: 'base' }
}

function baseName(name) {
  return norm(name)
    .replace(/\(.*?\)|\(.*$/g, ' ')
    .replace(/\bmega\b|\bprimo\b/g, ' ')
    .replace(/giga\s*max|gigama\b|gimamax|\bv\s*max\b/g, ' ')
    .replace(/\b(de|d')\s*(alola|galar|hisui|paldea)\b/g, ' ')
    .replace(/\b(hisui|galar|alola|paldea)\b/g, ' ')
    .replace(/\s[xy]\s*$/g, ' ')
}

function resolveDex(name) {
  if (MANUAL[name]) return MANUAL[name]
  const b = compact(baseName(name))
  if (byCompact.has(b)) return byCompact.get(b)
  // Préfixe le plus long (ex. "Kyurem Noir", "Dialga Originel")
  const pre = speciesList.find((s) => s.c.length >= 3 && b.startsWith(s.c))
  if (pre) return pre.id
  // Faute de frappe : distance de Levenshtein
  let best = null
  for (const s of speciesList) {
    const d = lev(b, s.c)
    if (!best || d < best.d) best = { id: s.id, d }
  }
  if (best && best.d <= 2) return best.id
  return null
}

// ---------- Pokédex ----------
const lines = read('data/pokedex-list.tsv').trim().split(/\r?\n/).slice(1)
const entries = []
const unresolved = []
const seen = new Set()
for (const line of lines) {
  const [rawName] = line.split('\t')
  const name = rawName.trim().replace(/\s+/g, ' ')
  if (!name) continue
  const dex = resolveDex(name)
  if (!dex) {
    unresolved.push(name)
    continue
  }
  const { form, variant } = detectForm(name)
  let id = `${dex}-${slug(name)}`
  while (seen.has(id)) id += '-b'
  seen.add(id)
  const e = { id, name, dex, gen: species.get(dex).gen, form }
  if (variant) e.variant = variant
  if (compact(name) !== compact(species.get(dex).name)) e.species = species.get(dex).name
  entries.push(e)
}

// ---------- Extensions TCGdex ----------
async function get(path) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(API + path)
    if (r.ok) return r.json()
    await new Promise((res) => setTimeout(res, 1000))
  }
  throw new Error('fetch ' + path)
}
const series = await get('/series')
const sets = {}
for (const s of series) {
  const full = await get('/series/' + s.id)
  for (const set of full.sets) sets[set.id] = { name: set.name, serie: s.id, official: set.cardCount?.official, total: set.cardCount?.total }
}
// Dates de sortie (pour trier les cartes)
const ids = Object.keys(sets)
for (let i = 0; i < ids.length; i += 10) {
  await Promise.all(
    ids.slice(i, i + 10).map(async (id) => {
      try {
        const d = await get('/sets/' + encodeURIComponent(id))
        sets[id].date = d.releaseDate
        if (d.logo) sets[id].logo = d.logo
      } catch {}
    }),
  )
}

// Index des cartes par numéro Pokédex : { [dex]: [[id, localId, name, hasImage], ...] }
// Les cartes TCG Pocket (série "tcgp") sont exclues.
const excluded = new Set(Object.entries(sets).filter(([, s]) => s.serie === 'tcgp').map(([id]) => id))
for (const id of excluded) delete sets[id]
const setOf = (cardId, localId) => cardId.slice(0, cardId.length - localId.length - 1)
const dexes = [...new Set(entries.map((e) => e.dex))]
const cards = {}
let nCards = 0
for (let i = 0; i < dexes.length; i += 12) {
  await Promise.all(
    dexes.slice(i, i + 12).map(async (dex) => {
      const list = await get(`/cards?dexId=eq:${dex}`)
      cards[dex] = list
        .filter((c) => sets[setOf(c.id, c.localId)])
        .map((c) => [c.id, c.localId, c.name, c.image ? 1 : 0])
      nCards += cards[dex].length
    }),
  )
  process.stdout.write(`\rcartes: ${Math.min(i + 12, dexes.length)}/${dexes.length}`)
}
console.log()

mkdirSync(new URL('public/data/', root), { recursive: true })
writeFileSync(new URL('public/data/pokedex.json', root), JSON.stringify(entries))
writeFileSync(new URL('public/data/sets.json', root), JSON.stringify(sets))
writeFileSync(new URL('public/data/cards.json', root), JSON.stringify(cards))
writeFileSync(new URL('public/data/meta.json', root), JSON.stringify({ updated: new Date().toISOString(), cards: nCards }))
console.log(`cartes indexées: ${nCards}`)

console.log(`entrées: ${entries.length}, extensions: ${ids.length}`)
const forms = entries.reduce((a, e) => ((a[e.form] = (a[e.form] || 0) + 1), a), {})
console.log('formes:', forms)
if (unresolved.length) console.log('NON RÉSOLUS:', unresolved)
// Contrôle : formes résolues vers une espèce au nom très différent
for (const e of entries.filter((e) => e.species)) console.log(`  ${e.name} -> #${e.dex} ${e.species} [${e.form}${e.variant ?? ''}]`)

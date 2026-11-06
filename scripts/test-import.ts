// Teste l'import Excel hors navigateur : npx tsx scripts/test-import.ts "chemin/vers/fichier.xlsx"
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { db } from '../src/lib/data'
import { analyze } from '../src/lib/importer'

const j = (p: string) => JSON.parse(readFileSync(new URL(`../public/data/${p}.json`, import.meta.url), 'utf8'))
db.entries = j('pokedex')
db.sets = j('sets')
db.raw = j('cards')
for (const e of db.entries) {
  db.byId.set(e.id, e)
  if (!db.byDex.has(e.dex)) db.byDex.set(e.dex, [])
  db.byDex.get(e.dex)!.push(e)
}

const wb = XLSX.read(readFileSync(process.argv[2]))
const sheet = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null })
const res = analyze(sheet)
const by = (s: string) => res.rows.filter((r) => r.status === s)
console.log(`possédées: ${res.rows.length}, non possédées: ${res.notOwned}, noms inconnus: ${res.missingNames.length}`)
console.log(`trouvées: ${by('found').length}, ambiguës: ${by('ambiguous').length}, non identifiées: ${by('unknown').length}`)
if (res.missingNames.length) console.log('noms inconnus:', res.missingNames)
const show = process.argv[3]
if (show === 'seed') {
  // Génère un jeu de données local (mode sans Supabase) pour tester l'affichage.
  const { writeFileSync } = await import('node:fs')
  const now = new Date().toISOString()
  const owned = res.rows.map((r) => ({
    id: crypto.randomUUID(),
    created_at: now,
    entry_id: r.entry!.id,
    card_id: r.status === 'unknown' ? null : r.chosen!.id,
    card_name: r.status === 'unknown' ? null : r.chosen!.name,
    image: r.status === 'unknown' ? null : r.chosen!.img,
    raw_ref: r.ref || null,
    note: r.note || null,
    featured: false,
  }))
  writeFileSync(process.argv[4], `<script>localStorage.setItem('pokedex-tcg:owned', ${JSON.stringify(JSON.stringify(owned))});location.href=location.hash.slice(1)||'/'</script>`)
  console.log('seed écrit:', owned.length)
} else if (show) for (const r of by(show)) console.log(`  L${r.line} ${r.name} | "${r.ref}" -> ${r.candidates.map((c) => c.id).join(', ')}`)

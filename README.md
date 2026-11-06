# Pokédex TCG

Suis ton Pokédex en cartes Pokémon : chaque Pokémon (et ses formes Méga, Gigamax, Alola, Galar, Hisui, Paldea, Primo)
a sa case. Au clic, toutes ses cartes FR disponibles ([TCGdex](https://tcgdex.dev/fr)) ; la carte que tu possèdes
remplace l'illustration dans le Pokédex.

App web installable sur téléphone (PWA) : Vue 3 + Vite + Pinia, collection stockée dans Supabase (ou en local).

## Lancer en local

```bash
npm install
npm run dev
```

Ouvre l'URL affichée. Depuis ton téléphone, sur le même Wi-Fi : utilise l'adresse `Network` affichée par Vite.

Sans configuration, l'app est en **mode local** (collection dans le navigateur, pas de compte).

## Activer la synchro (Supabase)

1. Crée un projet gratuit sur [supabase.com](https://supabase.com).
2. **SQL Editor** → colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → API** : copie l'URL et la clé `anon` dans un fichier `.env.local` (voir `.env.example`).
4. (Optionnel) **Authentication → Sign In / Providers → Email** : désactive « Confirm email » pour éviter l'e-mail de confirmation.
5. Relance `npm run dev`.

## Données

- `data/pokedex-list.tsv` : ta liste de Pokémon (nom, génération), dans l'ordre voulu.
- `npm run data` regénère `public/data/` : le Pokédex, l'index des extensions et l'index des cartes FR par numéro
  Pokédex (cartes TCG Pocket exclues). À relancer après une nouvelle extension ou si tu modifies la liste.
  Les nouvelles cartes sont de toute façon récupérées en direct sur la fiche d'un Pokémon.
- `npx tsx scripts/test-import.ts "fichier.xlsx" [ambiguous|unknown]` teste l'import Excel sans l'app.

## Mettre en ligne (Vercel)

1. Pousse le projet sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Add New → Project** → importe le repo (Vite est détecté tout seul).
3. Ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans **Environment Variables** → **Deploy**.
4. Sur le téléphone : ouvre le lien → **Partager → Sur l'écran d'accueil** (iPhone) ou **⋮ → Installer l'application** (Android).

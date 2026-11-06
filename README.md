# Pokédex TCG

Suis ton Pokédex en cartes Pokémon. Chaque Pokémon a sa case, et ses formes aussi (Méga, Gigamax, Alola, Galar, Hisui,
Paldea, Primo). Une case montre toutes les cartes FR disponibles pour ce Pokémon, et la carte que tu possèdes remplace
la silhouette grise dans le Pokédex.

- Données des cartes et images : [TCGdex](https://tcgdex.dev/fr). Les cartes TCG Pocket sont exclues.
- App web installable sur téléphone (PWA) : Vue 3, Vite, Pinia.
- Collection stockée dans [Supabase](https://supabase.com) (comptes et synchro), ou localement dans le navigateur.

---

## 1. Prérequis

| Outil | Version | Installation (Windows) |
| --- | --- | --- |
| Node.js | 20.19 ou plus (LTS conseillée) | `winget install OpenJS.NodeJS.LTS` ou [nodejs.org](https://nodejs.org) |
| Git | toute version récente | `winget install Git.Git` ou [git-scm.com](https://git-scm.com) |

Après l'installation, **redémarre ton terminal (ou VS Code)**, puis vérifie :

```bash
node -v
git --version
```

## 2. Installation

```bash
git clone https://github.com/Devconte/PokedexMobile.git
cd PokedexMobile
npm install
```

## 3. Lancer l'app

```bash
npm run dev
```

Vite affiche deux adresses :

```
➜  Local:   http://localhost:5173/        ← sur ce PC
➜  Network: http://192.168.x.x:5173/      ← sur ton téléphone (même Wi-Fi)
```

> **Le téléphone n'arrive pas à se connecter ?** Windows bloque sûrement la connexion. Accepte la fenêtre du pare-feu
> qui demande d'autoriser Node.js sur les **réseaux privés**, et vérifie que ton Wi-Fi est en profil « Privé ».

Sans autre configuration, l'app est en **mode local** : pas de compte, et la collection est enregistrée dans ce
navigateur uniquement. Pour la synchro entre appareils, configure Supabase (étape 5).

## 4. Importer ton fichier Excel

Dans l'app : **Compte → Importer mon fichier Excel**.

L'import lit le **premier onglet** et utilise ces colonnes :

| Colonne | Obligatoire | Exemple |
| --- | --- | --- |
| `Nom Pokémon` | oui | `Méga Dracaufeu X` |
| `Possédé` | oui | `Oui` / `Non` |
| `Num carte possédée` | conseillé | `143/142`, `SVP27`, `XY123`, `TG01/TG30`, `24/181 reverse` |
| `Série carte` | facultatif (aide à départager) | `EV7`, `EB12.5`, `ME2` |
| `Rareté` | facultatif (ajoutée en note) | `AR/TG` |

Après l'analyse, l'app classe chaque ligne dans une de ces catégories :

- **Trouvées** : une seule carte correspond au numéro.
- **À vérifier** : un candidat est proposé, mais le total de l'extension ne colle pas ou plusieurs cartes sont possibles.
  Choisis la bonne dans la liste.
- **Non identifiées** : aucune carte ne correspond. Le Pokémon est quand même marqué comme possédé, avec un badge **?**.
  Pour corriger, ouvre sa fiche, touche **Identifier**, puis touche la bonne carte.

Pour tester l'import sans ouvrir l'app :

```bash
npx tsx scripts/test-import.ts "C:\chemin\vers\fichier.xlsx" ambiguous   # ou: unknown
```

## 5. Comptes et synchro (Supabase)

1. Crée un projet gratuit sur [supabase.com](https://supabase.com) (**New project**).
2. Ouvre **SQL Editor → New query**, colle le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis clique sur **Run**.
3. Ouvre **Project Settings → API** et copie la **Project URL** et la clé **anon public**.
4. À la racine du projet, crée un fichier `.env.local` en partant de `.env.example` :

   ```env
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

5. (Optionnel) Dans **Authentication → Sign In / Providers → Email**, désactive **Confirm email** pour ne pas avoir
   à confirmer chaque inscription par e-mail.
6. Relance `npm run dev`. L'app demande alors de se connecter ou de créer un compte.

Chaque utilisateur ne voit que sa propre collection (Row Level Security). La clé `anon` peut être publique sans risque.
Ne mets **jamais** la clé `service_role` dans l'app.

> Tu as déjà une collection en mode local ? Avant de configurer Supabase, fais **Compte → Exporter une sauvegarde**.
> Une fois connecté, fais **Compte → Restaurer une sauvegarde**.

## 6. Mettre en ligne (Vercel, gratuit)

1. Va sur [vercel.com](https://vercel.com) et connecte-toi avec GitHub.
2. Fais **Add New → Project**, puis importe le dépôt `PokedexMobile`. Vite est détecté automatiquement.
3. Dans **Environment Variables**, ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. Clique sur **Deploy**. Chaque `git push` sur `main` redéploie ensuite le site automatiquement.

### Installer l'app sur le téléphone

- **iPhone (Safari)** : ouvre le lien, puis **Partager → Sur l'écran d'accueil**.
- **Android (Chrome)** : ouvre le lien, puis **⋮ → Installer l'application**.

L'app s'ouvre alors en plein écran, avec son icône. Les images déjà vues restent disponibles hors connexion.

## 7. Mettre à jour les données

Le Pokédex et l'index des cartes sont générés dans `public/data/` :

```bash
npm run data
```

Relance cette commande dans deux cas :

- **Une nouvelle extension est sortie.** Entre-temps, la fiche d'un Pokémon récupère quand même en direct les cartes
  qui manquent dans l'index.
- **Tu as modifié la liste des Pokémon** dans [`data/pokedex-list.tsv`](data/pokedex-list.tsv). Ce fichier contient le
  nom et la génération, dans l'ordre d'affichage.

Le script retrouve le numéro Pokédex de chaque nom, même avec une faute de frappe, et détecte sa forme. Si un nom
n'est pas reconnu, le script le signale : ajoute alors une correction dans `MANUAL`, dans
[`scripts/build-data.mjs`](scripts/build-data.mjs).

> Si tu renommes une entrée, son identifiant change, et les cartes déjà associées à l'ancien nom ne s'affichent plus.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (accessible depuis le réseau local) |
| `npm run build` | vérification TypeScript, puis build de production dans `dist/` |
| `npm run preview` | sert le build de production en local |
| `npm run data` | regénère le Pokédex et l'index des cartes |

## Structure

```
data/                 liste des Pokémon + noms FR des espèces (PokéAPI)
public/data/          JSON générés : pokedex, sets, cards, meta
scripts/              build-data.mjs (génération), test-import.ts (test de l'import)
supabase/schema.sql   table owned_cards + règles d'accès
src/lib/              données, filtrage des formes, import Excel, stockage (Supabase ou local)
src/stores/           auth et collection (Pinia)
src/views/            Pokédex, fiche Pokémon, Stats, Compte, Import, Connexion
```

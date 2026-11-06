-- À coller dans Supabase > SQL Editor > New query, puis "Run".

create table if not exists public.owned_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id text not null,          -- case du Pokédex (ex. "6-mega-dracaufeu-x")
  card_id text,                    -- id TCGdex (ex. "me02-013") ; null = possédée mais non identifiée
  card_name text,
  image text,                      -- URL de base de l'image TCGdex
  raw_ref text,                    -- numéro d'origine (import Excel)
  note text,
  featured boolean not null default false,  -- carte affichée dans le Pokédex
  created_at timestamptz not null default now()
);

create index if not exists owned_cards_user_idx on public.owned_cards (user_id);
create unique index if not exists owned_cards_unique_card
  on public.owned_cards (user_id, entry_id, card_id) where card_id is not null;

-- Chaque utilisateur ne voit et ne modifie que sa collection.
alter table public.owned_cards enable row level security;

drop policy if exists "own rows" on public.owned_cards;
create policy "own rows" on public.owned_cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

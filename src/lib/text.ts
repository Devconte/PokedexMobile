/** Minuscules, sans accents. */
export const norm = (s: string) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{Mn}/gu, '')

/** Comme norm(), sans espaces ni ponctuation : pour comparer des noms. */
export const compact = (s: string) => norm(s).replace(/[^a-z0-9♀♂]/g, '')

export const pad = (n: number) => String(n).padStart(4, '0').replace(/^0(?=\d{3})/, '')

export const artwork = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`

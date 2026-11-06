import type { Card, Entry, Form } from './types'
import { norm } from './text'

export const FORM_LABEL: Record<Form, string> = {
  base: '',
  mega: 'Méga',
  gmax: 'Gigamax',
  alola: 'Alola',
  galar: 'Galar',
  hisui: 'Hisui',
  paldea: 'Paldea',
  primal: 'Primo',
}

/** Le nom d'une carte correspond-il à cette forme ? (ex. "Méga-Dracaufeu X-ex" -> mega X) */
export function cardFitsForm(cardName: string, form: Form, variant?: 'X' | 'Y'): boolean {
  const n = norm(cardName)
  switch (form) {
    case 'mega': {
      if (!/^(m|mega)[\s-]|\smega[\s-]/.test(n)) return false
      if (!variant) return true
      const other = variant === 'X' ? 'y' : 'x'
      // Les vieilles cartes "M-Dracaufeu EX" ne précisent pas X/Y : on les garde dans les deux.
      return !new RegExp(`\\s${other}(-|\\s|$)`).test(n)
    }
    case 'gmax':
      return /vmax|v-max|gigamax/.test(n)
    case 'primal':
      return /^primo/.test(n)
    case 'base':
      return true
    default:
      return n.includes(form)
  }
}

/**
 * Cartes à afficher pour une entrée.
 * - Une forme (Méga, Alola…) ne garde que les cartes de cette forme.
 * - L'entrée de base exclut les cartes qui appartiennent à une forme ayant sa propre case.
 */
export function filterForEntry(cards: Card[], entry: Entry, siblings: Entry[]): Card[] {
  if (entry.form !== 'base') return cards.filter((c) => cardFitsForm(c.name, entry.form, entry.variant))
  const forms = siblings.filter((s) => s.form !== 'base')
  if (!forms.length) return cards
  return cards.filter((c) => !forms.some((f) => cardFitsForm(c.name, f.form)))
}

/**
 * Formatage centralisé (locale fr) — source unique pour montants, dates, pourcentages.
 * Jamais de `toLocaleString`/`toFixed` ad hoc dans un composant.
 */
const LOCALE = 'fr-FR'

const formateurMontant = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const formateurMontantPrecis = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const formateurDate = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const formateurDateHeure = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const formateurRelatif = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

const formateurPourcentage = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 2,
})

/** Convertit une chaîne décimale backend (`"2000.50"`) ou un nombre en nombre JS. */
export function versNombre(valeur: string | number | null | undefined): number {
  if (valeur === null || valeur === undefined || valeur === '') return 0
  const n = typeof valeur === 'number' ? valeur : Number.parseFloat(valeur)
  return Number.isFinite(n) ? n : 0
}

/** `2000` → « 2 000 FCFA ». La devise reste explicite (charte API). */
export function formatMontant(valeur: string | number | null | undefined, devise = 'XOF'): string {
  const n = versNombre(valeur)
  const libelle = devise === 'XOF' ? 'FCFA' : devise
  const texte = Number.isInteger(n) ? formateurMontant.format(n) : formateurMontantPrecis.format(n)
  return `${texte} ${libelle}`
}

/** Montant signé pour un historique : « + 3 600 FCFA » / « − 2 000 FCFA ». */
export function formatMontantSigne(
  valeur: string | number,
  sens: 'credit' | 'debit' | 'neutre',
  devise = 'XOF',
): string {
  const base = formatMontant(valeur, devise)
  if (sens === 'credit') return `+ ${base}`
  if (sens === 'debit') return `− ${base}`
  return base
}

/** `0.1` → « 10 % ». */
export function formatPourcentage(taux: string | number | null | undefined): string {
  return formateurPourcentage.format(versNombre(taux))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : formateurDate.format(d)
}

export function formatDateHeure(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : formateurDateHeure.format(d)
}

/** « il y a 3 min », « dans 2 h », « hier ». */
export function formatDateRelative(iso: string | null | undefined, maintenant = Date.now()): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const delta = Math.round((d - maintenant) / 1000)
  const abs = Math.abs(delta)
  if (abs < 60) return formateurRelatif.format(delta, 'second')
  if (abs < 3600) return formateurRelatif.format(Math.round(delta / 60), 'minute')
  if (abs < 86400) return formateurRelatif.format(Math.round(delta / 3600), 'hour')
  if (abs < 86400 * 30) return formateurRelatif.format(Math.round(delta / 86400), 'day')
  return formatDate(iso)
}

/** Référence courte pour l'affichage : « PAY-5eb206a1… ». */
export function formatReference(ref: string | null | undefined, longueur = 12): string {
  if (!ref) return '—'
  return ref.length > longueur ? `${ref.slice(0, longueur)}…` : ref
}

/** Identifiant UUID abrégé : « #a1b2c3d4 ». */
export function formatIdentifiant(id: string | null | undefined): string {
  return id ? `#${id.slice(0, 8)}` : '—'
}

export function pluriel(n: number, singulier: string, plurielForme?: string): string {
  return n > 1 ? (plurielForme ?? `${singulier}s`) : singulier
}

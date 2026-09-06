/**
 * Outils communs aux formulaires React Hook Form + Zod : report des erreurs de validation
 * renvoyées par le backend (`details`) champ par champ, messages en français.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { Resultat } from '@/server/http-client'

/** Reporte `details` (champ → message) dans le formulaire ; renvoie le message global. */
export function appliquerErreursApi<T extends FieldValues>(
  resultat: Extract<Resultat<unknown>, { ok: false }>,
  setError: UseFormSetError<T>,
): string {
  if (resultat.details) {
    for (const [champ, message] of Object.entries(resultat.details)) {
      setError(champ as Path<T>, { type: 'server', message })
    }
  }
  return resultat.message
}

export const MESSAGES = {
  requis: 'Champ obligatoire',
  email: 'Adresse e-mail invalide',
  motDePasse: '6 caractères minimum',
  pseudo: 'Entre 3 et 50 caractères',
  montant: 'Montant invalide',
}

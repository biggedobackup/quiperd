/**
 * Outils communs aux formulaires React Hook Form + Zod : report des erreurs de validation
 * renvoyées par le backend (`details`) champ par champ, messages en français.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { EchecResultat } from '@/server/http-client'

/**
 * Lit un entier positif porté par une réponse d'erreur, qu'il soit rangé dans `details`
 * (chaînes, charte API) ou à la racine du corps JSON — `essaisRestants` d'un code de
 * vérification, `prochainEnvoiDans` d'un renvoi limité. `null` s'il est absent ou illisible :
 * l'écran se rabat alors sur le message du backend, il n'invente jamais de chiffre.
 */
export function nombreDeLErreur(echec: EchecResultat, champ: string): number | null {
  const brut = echec.details?.[champ] ?? echec.corps?.[champ]
  const n = typeof brut === 'number' ? brut : typeof brut === 'string' ? Number(brut) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/** Reporte `details` (champ → message) dans le formulaire ; renvoie le message global. */
export function appliquerErreursApi<T extends FieldValues>(
  resultat: EchecResultat,
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

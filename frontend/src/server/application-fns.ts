/**
 * Adresses de téléchargement de l'application joueur, lues côté serveur.
 *
 * Elles vivent dans l'environnement et non en dur dans le code pour une raison simple : le jour
 * où l'application est publiée, on colle l'adresse du magasin dans le `.env` et la section
 * d'accueil s'allume — sans toucher au code ni reconstruire une image différente par
 * environnement. Tant qu'une adresse est absente, la plateforme correspondante s'affiche
 * « Bientôt disponible » : on ne promet jamais un magasin où l'application n'est pas encore.
 */
import { createServerFn } from '@tanstack/react-start'

export interface LiensApplication {
  /** Fiche Google Play, ou adresse directe d'un APK. `null` tant que rien n'est publié. */
  android: string | null
  /** Fiche App Store. `null` tant que rien n'est publié. */
  ios: string | null
}

/** Une valeur d'environnement vide ou faite d'espaces vaut « pas encore publié ». */
function nettoyer(valeur: string | undefined): string | null {
  const v = valeur?.trim()
  return v ? v : null
}

export const obtenirLiensApplication = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LiensApplication> => ({
    android: nettoyer(process.env.APP_ANDROID_URL),
    ios: nettoyer(process.env.APP_IOS_URL),
  }),
)

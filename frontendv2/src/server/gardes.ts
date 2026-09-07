/**
 * Gardes de route (utilisables dans `beforeLoad`, côté serveur ET côté client) :
 * elles n'importent que des server functions, jamais de code serveur direct.
 */
import { redirect } from '@tanstack/react-router'
import { obtenirSessionAdmin, obtenirSessionJoueur, type SessionAdmin, type SessionJoueur } from './session-fns'

/** Garde joueur : layout `/joueur`. */
export async function gardeJoueur(): Promise<SessionJoueur> {
  const session = await obtenirSessionJoueur()
  if (!session) throw redirect({ to: '/connexion' })
  return session
}

/** Garde admin : layout `/admin/_prive`. */
export async function gardeAdmin(): Promise<SessionAdmin> {
  const session = await obtenirSessionAdmin()
  if (!session) throw redirect({ to: '/admin/connexion' })
  return session
}

/** Garde invité : un joueur déjà connecté n'a rien à faire sur connexion/inscription. */
export async function gardeInvite(): Promise<void> {
  const session = await obtenirSessionJoueur()
  if (session) throw redirect({ to: '/joueur/tableau-de-bord' })
}

/** Garde invité admin : un administrateur déjà connecté est renvoyé vers son tableau. */
export async function gardeInviteAdmin(): Promise<void> {
  const session = await obtenirSessionAdmin()
  if (session) throw redirect({ to: '/admin/tableau-de-bord' })
}

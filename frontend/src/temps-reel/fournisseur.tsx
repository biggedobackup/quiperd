/**
 * Provider React du temps réel : monté une seule fois, au plus haut niveau de l'application
 * (`routes/__root.tsx`). Il couvre les trois espaces — site public (visiteur), espace joueur
 * et tableau admin — puisque le hub accepte les connexions sans ticket en visiteur.
 *
 * Rendu serveur : le provider se monte normalement mais n'ouvre RIEN. La connexion démarre
 * dans un effet, donc après hydratation ; le premier rendu client est identique au rendu
 * serveur (aucune différence de balisage).
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { obtenirClientTempsReel, type ClientTempsReel } from './client'
import type { EspaceTempsReel } from '@/services/temps-reel'

export interface ContexteTempsReel {
  client: ClientTempsReel
  /** `false` quand le provider est monté mais volontairement débranché. */
  actif: boolean
}

const Contexte = createContext<ContexteTempsReel | null>(null)

export interface ProprietesFournisseurTempsReel {
  children: ReactNode
  /**
   * Espace dont on demande le ticket. `auto` (défaut) prend le cookie joueur, à défaut le
   * cookie admin ; quand l'URL courante commence par `/admin`, le cookie admin est prioritaire.
   */
  espace?: EspaceTempsReel
  /** Permet de couper le temps réel (tests, pages sans besoin) sans démonter l'arbre. */
  actif?: boolean
}

export function FournisseurTempsReel({ children, espace = 'auto', actif = true }: ProprietesFournisseurTempsReel) {
  const client = useMemo(() => obtenirClientTempsReel(), [])
  const chemin = useRouterState({ select: (etat) => etat.location.pathname })

  useEffect(() => {
    if (!actif) return
    client.definirEspace(espace)
    client.demarrer()
    return () => client.arreter()
  }, [client, espace, actif])

  // Un administrateur qui passe de l'espace joueur à l'espace admin (ou l'inverse) sans
  // recharger garderait un socket ouvert avec le mauvais rôle : les salons de l'autre espace
  // lui seraient refusés et ses écrans resteraient muets. Le changement de route déclenche
  // donc une vérification — qui ne rouvre le socket que si l'espace a réellement changé.
  useEffect(() => {
    if (!actif) return
    client.verifierEspace()
  }, [client, actif, chemin])

  const valeur = useMemo<ContexteTempsReel>(() => ({ client, actif }), [client, actif])
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

/**
 * Contexte du temps réel. Ne lève jamais : hors provider, on retombe sur le client singleton
 * (les abonnements restent en file d'attente) avec `actif: false`.
 */
export function useContexteTempsReel(): ContexteTempsReel {
  const contexte = useContext(Contexte)
  const client = obtenirClientTempsReel()
  return useMemo<ContexteTempsReel>(() => contexte ?? { client, actif: false }, [contexte, client])
}

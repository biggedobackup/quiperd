/**
 * Options TanStack Query par module : la queryFn est toujours une server function de
 * `services/` — un loader appelle `queryClient.ensureQueryData(options)`, le composant
 * `useSuspenseQuery(options)`. Une seule définition par ressource.
 */
import { queryOptions } from '@tanstack/react-query'
import { cles } from './query'
import { lireReglesFinancieres, lireStatistiques, listerConfigurations, listerJournalAudit } from '@/services/administration'
import { listerJeux } from '@/services/jeux'
import { listerPlateformes } from '@/services/plateformes'
import { detailDefi, listerDefis, listerDefisOuverts } from '@/services/defis'
import { detailMatch, listerMatchs, listerMatchsAdmin, type RoleAppel } from '@/services/matchs'
import { listerPreuves } from '@/services/preuves'
import { listerLitiges, listerLitigesAdmin } from '@/services/litiges'
import { lirePortefeuille, listerTransactions } from '@/services/portefeuilles'
import { listerNotifications } from '@/services/notifications'
import { listerComptesGamers } from '@/services/comptes-gamers'
import { detailUtilisateur, listerUtilisateurs } from '@/services/utilisateurs'
import { listerPaiements, listerPrestataires } from '@/services/paiements'
import { obtenirSessionAdmin, obtenirSessionJoueur } from '@/server/session-fns'
import type { FiltresDefis, FiltresDefisPublics } from '@/models/defi'

export const TAILLE_PAGE = 20

/** Listes admin paginées (`Page<T>`) : fraîcheur courte — les mutations invalident de toute façon la famille. */
const STALE_ADMIN = 5_000

/** Défis ouverts du site public : rafraîchis souvent, la page les affiche « en direct ». */
export const optionsDefisOuverts = (filtres: FiltresDefisPublics = {}) =>
  queryOptions({
    queryKey: cles.defis.ouverts(filtres),
    queryFn: () => listerDefisOuverts({ data: filtres }),
    staleTime: 10_000,
  })

/**
 * Session courante, **mise en cache**.
 *
 * La garde de l'espace joueur s'exécute dans le `beforeLoad` du gabarit, donc à CHAQUE
 * navigation interne. Sans cache, chaque changement de page payait un aller-retour
 * `/auth/moi` avant d'afficher quoi que ce soit — et comme le gabarit est déjà monté, le
 * routeur n'a rien d'autre à montrer pendant ce temps que la page qu'on vient de quitter.
 * C'est exactement le « flash des données de la page précédente ».
 *
 * Une minute de fraîcheur suffit : la session reste vérifiée par le backend à chaque appel
 * d'API (401 → redirection), et la déconnexion vide tout le cache (`queryClient.clear()`).
 */
export const optionsSessionJoueur = queryOptions({
  queryKey: cles.session,
  queryFn: () => obtenirSessionJoueur(),
  staleTime: 60_000,
})

export const optionsSessionAdmin = queryOptions({
  queryKey: cles.sessionAdmin,
  queryFn: () => obtenirSessionAdmin(),
  staleTime: 60_000,
})

export const optionsRegles = queryOptions({
  queryKey: cles.regles,
  queryFn: () => lireReglesFinancieres(),
  staleTime: 5 * 60_000,
})

/** Moyens de paiement réellement disponibles — change avec la configuration serveur, pas avec l'écran. */
export const optionsPrestataires = queryOptions({
  queryKey: cles.prestataires,
  queryFn: () => listerPrestataires(),
  staleTime: 5 * 60_000,
})

export const optionsJeux = (admin = false) =>
  queryOptions({
    queryKey: [...cles.jeux, admin ? 'admin' : 'public'],
    queryFn: () => listerJeux({ data: { admin } }),
    staleTime: 60_000,
  })

export const optionsPlateformes = (admin = false) =>
  queryOptions({
    queryKey: [...cles.plateformes, admin ? 'admin' : 'public'],
    queryFn: () => listerPlateformes({ data: { admin } }),
    staleTime: 60_000,
  })

export const optionsDefis = (filtres: FiltresDefis = {}) =>
  queryOptions({
    queryKey: cles.defis.liste(filtres),
    queryFn: () => listerDefis({ data: filtres }),
  })

export const optionsMesDefis = queryOptions({
  queryKey: cles.defis.mes,
  queryFn: () => listerDefis({ data: { mes: true } }),
})

export const optionsDetailDefi = (id: string) =>
  queryOptions({
    queryKey: cles.defis.detail(id),
    queryFn: () => detailDefi({ data: { id } }),
  })

export const optionsMatchs = (statut?: string, role: RoleAppel = 'joueur') =>
  queryOptions({
    queryKey: [...cles.matchs.liste(statut), role],
    queryFn: () => listerMatchs({ data: { statut, role } }),
  })

/** Tous les matchs (admin), paginés — `statut` vide = tous. */
export const optionsMatchsAdmin = (statut = '', page = 1) =>
  queryOptions({
    queryKey: cles.matchs.pageAdmin(statut, page),
    queryFn: () => listerMatchsAdmin({ data: { statut: statut || undefined, page } }),
    staleTime: STALE_ADMIN,
  })

export const optionsDetailMatch = (id: string, role: RoleAppel = 'joueur') =>
  queryOptions({
    queryKey: [...cles.matchs.detail(id), role],
    queryFn: () => detailMatch({ data: { id, role } }),
  })

export const optionsPreuves = (matchId: string, role: RoleAppel = 'joueur') =>
  queryOptions({
    queryKey: [...cles.matchs.preuves(matchId), role],
    queryFn: () => listerPreuves({ data: { matchId, role } }),
  })

export const optionsLitiges = (role: RoleAppel = 'joueur') =>
  queryOptions({
    queryKey: cles.litiges.liste(role === 'admin'),
    queryFn: () => listerLitiges({ data: { role } }),
  })

/** Tous les litiges (admin), paginés. */
export const optionsLitigesAdmin = (page = 1) =>
  queryOptions({
    queryKey: cles.litiges.pageAdmin(page),
    queryFn: () => listerLitigesAdmin({ data: { page } }),
    staleTime: STALE_ADMIN,
  })

export const optionsPortefeuille = queryOptions({
  queryKey: cles.portefeuille.solde,
  queryFn: () => lirePortefeuille(),
})

export const optionsTransactions = (page: number) =>
  queryOptions({
    queryKey: cles.portefeuille.transactions(page),
    queryFn: () => listerTransactions({ data: { limite: TAILLE_PAGE, decalage: (page - 1) * TAILLE_PAGE } }),
  })

export const optionsNotifications = queryOptions({
  queryKey: cles.notifications,
  queryFn: () => listerNotifications(),
  staleTime: 10_000,
})

export const optionsComptesGamers = queryOptions({
  queryKey: cles.comptesGamers,
  queryFn: () => listerComptesGamers(),
})

export const optionsStatistiques = queryOptions({
  queryKey: cles.admin.statistiques,
  queryFn: () => lireStatistiques(),
})

/** Comptes joueurs (admin), paginés — sans argument : page 1, tous statuts. */
export const optionsUtilisateurs = (recherche = '', statut = '', page = 1) =>
  queryOptions({
    queryKey: cles.admin.utilisateurs(recherche, statut, page),
    queryFn: () => listerUtilisateurs({ data: { recherche, statut, page } }),
    staleTime: STALE_ADMIN,
  })

/** Détail d'un joueur par identifiant : fiche « Voir », résolution des pseudos (paiements, journal). */
export const optionsUtilisateur = (id: string) =>
  queryOptions({
    queryKey: cles.admin.utilisateur(id),
    queryFn: () => detailUtilisateur({ data: { id } }),
    staleTime: 60_000,
  })

export const optionsPaiements = (type = '', statut = '', page = 1) =>
  queryOptions({
    queryKey: cles.admin.paiements(type, statut, page),
    queryFn: () => listerPaiements({ data: { type, statut, page } }),
    staleTime: STALE_ADMIN,
  })

export const optionsConfigurations = queryOptions({
  queryKey: cles.admin.configurations,
  queryFn: () => listerConfigurations(),
})

export const optionsJournal = (action = '', page = 1) =>
  queryOptions({
    queryKey: cles.admin.journal(action, page),
    queryFn: () => listerJournalAudit({ data: { action, page } }),
    staleTime: STALE_ADMIN,
  })

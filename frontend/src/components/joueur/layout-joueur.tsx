import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatMontant } from '@/lib/format'
import { optionsNotifications, optionsPortefeuille } from '@/lib/requetes'
import type { Utilisateur } from '@/models/utilisateur'
import { deconnexionJoueur } from '@/services/auth'
import { urlPhotoProfil } from '@/components/joueur/champ-photo-profil'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useIdentiteTempsReel } from '@/temps-reel/hooks'
import { ajouterNotification, fusionnerSolde } from '@/temps-reel/cache'
import { Logo } from '@/components/partages/logo/logo'
import { Skeleton } from '@/components/partages/skeleton/skeleton'
import { toastSucces } from '@/components/partages/toast/toast'
import { BandeauEmailNonConfirme, emailNonConfirme } from '@/components/joueur/email-non-verifie'

interface Entree {
  to: string
  libelle: string
  /** Libellé de la barre basse mobile (un mot lisible à 10 px, jamais un libellé tronqué). */
  court?: string
  icone: IconDefinition
  /** Visible dans la barre basse mobile. */
  mobile?: boolean
}

const ENTREES: Entree[] = [
  { to: '/joueur/tableau-de-bord', libelle: 'Tableau de bord', court: 'Accueil', icone: icone.accueil, mobile: true },
  { to: '/joueur/defis', libelle: 'Défis', icone: icone.defi, mobile: true },
  { to: '/joueur/matchs', libelle: 'Mes matchs', court: 'Matchs', icone: icone.match, mobile: true },
  { to: '/joueur/portefeuille', libelle: 'Portefeuille', court: 'Argent', icone: icone.portefeuille, mobile: true },
  { to: '/joueur/litiges', libelle: 'Litiges', icone: icone.litige },
  { to: '/joueur/notifications', libelle: 'Notifications', icone: icone.notification },
  { to: '/joueur/profil', libelle: 'Profil', icone: icone.profil, mobile: true },
]

export function LayoutJoueur({ utilisateur, children }: { utilisateur: Utilisateur; children: ReactNode }) {
  const chemin = useRouterState({ select: (s) => s.location.pathname })
  const { data: notifications } = useQuery(optionsNotifications)
  const nonLues = notifications?.filter((n) => !n.lu).length ?? 0

  // Abonnement au salon privé du joueur monté UNE FOIS pour tout l'espace joueur. Le badge de
  // notifications et le solde de la barre latérale sont visibles depuis n'importe quel écran :
  // s'ils ne dépendaient que des abonnements des pages (portefeuille, notifications, litiges),
  // ils resteraient figés sur les défis, les matchs, le tableau de bord ou le profil.
  // Le socket doit être celui de CE joueur : une connexion ou une inscription se fait par
  // navigation interne, sans recharger la page, et laisserait sinon le socket du visiteur.
  useIdentiteTempsReel(utilisateur.id)

  const queryClient = useQueryClient()
  const monSalon = salons.utilisateur(utilisateur.id)
  useEvenement('notification.nouvelle', (n) => ajouterNotification(queryClient, n), monSalon)
  useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde), monSalon)

  return (
    <div className="flex min-h-dvh bg-craie">
      <Sidebar nonLues={nonLues} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-[76px] lg:pl-[264px]">
        <Navbar utilisateur={utilisateur} nonLues={nonLues} />
        {/*
          Rappel tant que l'adresse n'est pas confirmée. Il vit hors du `<main>` : il ne suit
          donc pas le contenu remplacé à chaque changement de page, et il disparaît dès que la
          confirmation a rechargé la session (`router.invalidate()`), sans rechargement complet.
          Inutile sur l'écran de confirmation lui-même, qui dit déjà tout.
        */}
        {emailNonConfirme(utilisateur) && chemin !== '/joueur/confirmation-email' && <BandeauEmailNonConfirme email={utilisateur.email} />}
        {/*
          Aucune transition entre deux pages : la nouvelle prend la place de l'ancienne sans
          fondu. Un `AnimatePresence mode="wait"` vivait ici et sérialisait la sortie puis
          l'entrée — l'écran restait en train de s'effacer puis de réapparaître pendant près
          d'une demi-seconde à chaque clic dans la navigation.
        */}
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <BarreBasse />
    </div>
  )
}

function Sidebar({ nonLues }: { nonLues: number }) {
  const { data: portefeuille, isPending } = useQuery(optionsPortefeuille)
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col bg-encre text-craie md:flex lg:w-[264px]">
      {/*
        Rail de 76 px (md → lg) : 76 − 2 px de bordure droite − 2 × 16 px de padding = 42 px utiles.
        Le logotype complet `sm` (carré 24 px + gap 10 px + « Défis en Ligne » ≈ 90 px ≈ 124 px) y débordait
        et se peignait par-dessus le header (z-30 > z-20) : on n'y montre que la marque (carré de
        28,8 px), centrée. Le nom complet n'apparaît qu'à partir de lg, où le rail fait 264 px.
      */}
      <div className="flex h-16 items-center justify-center overflow-hidden border-b border-craie/15 px-4 lg:justify-start lg:px-6">
        <span className="lg:hidden">
          <Logo ton="clair" variante="marque" />
        </span>
        <span className="hidden lg:block">
          <Logo ton="clair" />
        </span>
      </div>
      <div className="hidden border-b border-craie/15 px-6 py-5 lg:block">
        <span className="etiquette text-craie/60">Solde disponible</span>
        {isPending || !portefeuille ? (
          <Skeleton className="mt-2 h-7 w-32 bg-craie/20" />
        ) : (
          <p className="chiffres mt-1 text-h3 font-bold text-volt">{formatMontant(portefeuille.soldeDisponible)}</p>
        )}
        {portefeuille && <p className="chiffres mt-1 text-legende text-craie/60">Bloqué : {formatMontant(portefeuille.soldeBloque)}</p>}
      </div>
      <nav className="flex-1 py-3" aria-label="Espace joueur">
        {ENTREES.map((e) => (
          <Link
            key={e.to}
            to={e.to}
            className="relative mx-2 flex h-12 items-center gap-3 rounded-xl px-3 transition-colors lg:mx-3 lg:px-4"
            activeProps={{ className: 'bg-vert text-craie' }}
            inactiveProps={{ className: 'text-craie/70 hover:bg-craie/8 hover:text-craie' }}
          >
            <FontAwesomeIcon icon={e.icone} fixedWidth />
            <span className="etiquette hidden lg:inline">{e.libelle}</span>
            {e.to === '/joueur/notifications' && nonLues > 0 && (
              <span className="chiffres absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-vert px-1 text-[10px] font-bold text-craie lg:static lg:ml-auto lg:bg-craie/15">{nonLues}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-craie/15 p-4 lg:p-6">
        <Link to="/joueur/defis/nouveau" className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-vert font-titre text-[12px] font-bold uppercase tracking-wider text-craie transition-colors hover:bg-vert-sombre">
          <FontAwesomeIcon icon={icone.ajouter} />
          <span className="hidden lg:inline">Nouveau défi</span>
        </Link>
      </div>
    </aside>
  )
}

function Navbar({ utilisateur, nonLues }: { utilisateur: Utilisateur; nonLues: number }) {
  const [menu, setMenu] = useState(false)
  const deconnecter = useServerFn(deconnexionJoueur)
  const navigate = useNavigate()
  const router = useRouter()
  const chemin = useRouterState({ select: (s) => s.location.pathname })
  const titre = ENTREES.find((e) => chemin.startsWith(e.to))?.libelle ?? 'Espace joueur'

  const queryClientDeconnexion = useQueryClient()

  const seDeconnecter = async () => {
    await deconnecter()
    // Le cache de requêtes est vidé AVANT toute navigation : il contient le solde, les
    // notifications, les matchs et les litiges du joueur qui part. Sans cela, quelqu'un qui
    // se connecte ensuite depuis le même onglet — un téléphone prêté, un cybercafé — verrait
    // les données du précédent jusqu'au premier rechargement complet de la page.
    queryClientDeconnexion.clear()
    toastSucces('À bientôt dans l’arène.')
    await router.invalidate()
    await navigate({ to: '/' })
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-trait bg-craie px-4 shadow-barre sm:px-6 lg:px-8">
      {/* < md : logo complet `sm` (≈ 124 px) ; dès md le logo vit dans le rail, le header ne porte que le titre. */}
      <div className="flex shrink-0 items-center gap-3 md:hidden">
        <Logo taille="sm" />
      </div>
      {/* `min-w-0` + `truncate` : si la place manque, seul le titre cède, jamais le logo ni les actions à droite. */}
      <h1 className="hidden min-w-0 truncate text-h3 md:block">{titre}</h1>
      <div className="flex shrink-0 items-center gap-1">
        <Link to="/joueur/notifications" className="relative flex size-11 items-center justify-center rounded-[10px] text-muet transition-colors hover:bg-gris hover:text-encre" aria-label={`Notifications (${nonLues} non lues)`}>
          <FontAwesomeIcon icon={icone.notification} />
          {nonLues > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-perte" aria-hidden="true" />}
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-haspopup="menu"
            className="flex h-11 items-center gap-2 rounded-full border border-trait bg-papier px-2 pr-3.5 transition-colors hover:border-vert"
          >
            {/* Photo du joueur si elle existe, initiales sinon : la pastille garde la même
                taille dans les deux cas, la barre ne saute pas au chargement. */}
            {utilisateur.photoProfil ? (
              <img
                src={urlPhotoProfil(utilisateur.id, utilisateur.photoProfil)}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="chiffres flex size-7 items-center justify-center rounded-full bg-vert text-[11px] font-bold uppercase text-craie">{utilisateur.nomUtilisateur.slice(0, 2)}</span>
            )}
            <span className="hidden max-w-32 truncate text-legende font-semibold sm:inline">{utilisateur.nomUtilisateur}</span>
            <FontAwesomeIcon icon={icone.chevronBas} className="text-xs" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-13 w-56 overflow-hidden rounded-2xl border border-trait bg-papier shadow-carte-forte" onMouseLeave={() => setMenu(false)}>
              <div className="border-b border-trait px-4 py-3">
                <p className="truncate text-legende font-bold">{utilisateur.nomUtilisateur}</p>
                <p className="truncate text-[12px] text-muet">{utilisateur.email}</p>
              </div>
              <Link to="/joueur/profil" role="menuitem" className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-legende hover:bg-vert-pale" onClick={() => setMenu(false)}>
                <FontAwesomeIcon icon={icone.profil} fixedWidth /> Mon profil
              </Link>
              <button type="button" role="menuitem" onClick={() => void seDeconnecter()} className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-legende text-perte hover:bg-perte-fond">
                <FontAwesomeIcon icon={icone.deconnexion} fixedWidth /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function BarreBasse() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-encre text-craie md:hidden" aria-label="Navigation mobile">
      {ENTREES.filter((e) => e.mobile).map((e) => (
        <Link
          key={e.to}
          to={e.to}
          className="relative flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors"
          activeProps={{ className: 'text-volt after:absolute after:inset-x-4 after:top-0 after:h-[3px] after:rounded-b-full after:bg-volt after:content-[""]' }}
          inactiveProps={{ className: 'text-craie/60' }}
        >
          <FontAwesomeIcon icon={e.icone} />
          <span className="truncate px-1">{e.court ?? e.libelle}</span>
        </Link>
      ))}
    </nav>
  )
}

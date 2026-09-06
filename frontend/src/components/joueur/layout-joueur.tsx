import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatMontant } from '@/lib/format'
import { optionsNotifications, optionsPortefeuille } from '@/lib/requetes'
import type { Utilisateur } from '@/models/utilisateur'
import { deconnexionJoueur } from '@/services/auth'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { ajouterNotification, fusionnerSolde } from '@/temps-reel/cache'
import { Logo } from '@/components/partages/logo/logo'
import { Skeleton } from '@/components/partages/skeleton/skeleton'
import { toastSucces } from '@/components/partages/toast/toast'

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
  const reduit = useReducedMotion()
  const { data: notifications } = useQuery(optionsNotifications)
  const nonLues = notifications?.filter((n) => !n.lu).length ?? 0

  // Abonnement au salon privé du joueur monté UNE FOIS pour tout l'espace joueur. Le badge de
  // notifications et le solde de la barre latérale sont visibles depuis n'importe quel écran :
  // s'ils ne dépendaient que des abonnements des pages (portefeuille, notifications, litiges),
  // ils resteraient figés sur les défis, les matchs, le tableau de bord ou le profil.
  const queryClient = useQueryClient()
  const monSalon = salons.utilisateur(utilisateur.id)
  useEvenement('notification.nouvelle', (n) => ajouterNotification(queryClient, n), monSalon)
  useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde), monSalon)

  return (
    <div className="flex min-h-dvh bg-craie">
      <Sidebar nonLues={nonLues} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-[76px] lg:pl-[264px]">
        <Navbar utilisateur={utilisateur} nonLues={nonLues} />
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={chemin}
              initial={reduit ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduit ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mx-auto w-full max-w-6xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BarreBasse />
    </div>
  )
}

function Sidebar({ nonLues }: { nonLues: number }) {
  const { data: portefeuille, isPending } = useQuery(optionsPortefeuille)
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r-2 border-encre bg-nuit text-craie md:flex lg:w-[264px]">
      {/*
        Rail de 76 px (md → lg) : 76 − 2 px de bordure droite − 2 × 16 px de padding = 42 px utiles.
        Le logotype complet `sm` (carré 24 px + gap 10 px + « QUI PERD » ≈ 90 px ≈ 124 px) y débordait
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
            className="relative flex h-12 items-center gap-3 border-l-[3px] px-5 transition-colors lg:px-6"
            activeProps={{ className: 'border-volt bg-craie/5 text-craie' }}
            inactiveProps={{ className: 'border-transparent text-craie/70 hover:bg-craie/5 hover:text-craie' }}
          >
            <FontAwesomeIcon icon={e.icone} fixedWidth />
            <span className="etiquette hidden lg:inline">{e.libelle}</span>
            {e.to === '/joueur/notifications' && nonLues > 0 && (
              <span className="chiffres absolute right-3 top-2 flex h-5 min-w-5 items-center justify-center bg-volt px-1 text-[10px] font-bold text-nuit lg:static lg:ml-auto">{nonLues}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-craie/15 p-4 lg:p-6">
        <Link to="/joueur/defis/nouveau" className="flex h-11 items-center justify-center gap-2 border-2 border-volt bg-volt font-titre text-[12px] font-bold uppercase tracking-wider text-nuit transition-colors hover:bg-craie">
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-2 border-encre bg-craie px-4 sm:px-6 lg:px-8">
      {/* < md : logo complet `sm` (≈ 124 px) ; dès md le logo vit dans le rail, le header ne porte que le titre. */}
      <div className="flex shrink-0 items-center gap-3 md:hidden">
        <Logo taille="sm" />
      </div>
      {/* `min-w-0` + `truncate` : si la place manque, seul le titre cède, jamais le logo ni les actions à droite. */}
      <h1 className="hidden min-w-0 truncate text-h3 md:block">{titre}</h1>
      <div className="flex shrink-0 items-center gap-1">
        <Link to="/joueur/notifications" className="relative flex size-11 items-center justify-center border-2 border-transparent transition-colors hover:border-encre" aria-label={`Notifications (${nonLues} non lues)`}>
          <FontAwesomeIcon icon={icone.notification} />
          {nonLues > 0 && <span className="absolute right-1 top-1 size-2 bg-perte" aria-hidden="true" />}
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-haspopup="menu"
            className="flex h-11 items-center gap-2 border-2 border-encre bg-papier px-2 pr-3 transition-colors hover:bg-volt hover:text-nuit"
          >
            <span className="chiffres flex size-6 items-center justify-center bg-encre text-[11px] font-bold uppercase text-craie">{utilisateur.nomUtilisateur.slice(0, 2)}</span>
            <span className="hidden max-w-32 truncate text-legende font-semibold sm:inline">{utilisateur.nomUtilisateur}</span>
            <FontAwesomeIcon icon={icone.chevronBas} className="text-xs" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-11 w-56 border-2 border-encre bg-papier shadow-tampon" onMouseLeave={() => setMenu(false)}>
              <div className="border-b border-trait px-4 py-3">
                <p className="truncate text-legende font-bold">{utilisateur.nomUtilisateur}</p>
                <p className="truncate text-[12px] text-muet">{utilisateur.email}</p>
              </div>
              <Link to="/joueur/profil" role="menuitem" className="flex items-center gap-2 px-4 py-2.5 text-legende hover:bg-volt-fond" onClick={() => setMenu(false)}>
                <FontAwesomeIcon icon={icone.profil} fixedWidth /> Mon profil
              </Link>
              <button type="button" role="menuitem" onClick={() => void seDeconnecter()} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-legende text-perte hover:bg-perte-fond">
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
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-2 border-encre bg-nuit text-craie md:hidden" aria-label="Navigation mobile">
      {ENTREES.filter((e) => e.mobile).map((e) => (
        <Link
          key={e.to}
          to={e.to}
          className="flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] text-[10px] font-bold uppercase tracking-wider"
          activeProps={{ className: 'border-volt text-volt' }}
          inactiveProps={{ className: 'border-transparent text-craie/60' }}
        >
          <FontAwesomeIcon icon={e.icone} />
          <span className="truncate px-1">{e.court ?? e.libelle}</span>
        </Link>
      ))}
    </nav>
  )
}

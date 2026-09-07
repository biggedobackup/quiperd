import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import type { Administrateur } from '@/models/utilisateur'
import { deconnexionAdmin } from '@/services/auth'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { useIdentiteTempsReel } from '@/temps-reel/hooks'
import { Logo } from '@/components/partages/logo/logo'
import { AbonnementAdmin } from '@/components/admin/temps-reel-admin'
import { toastSucces } from '@/components/partages/toast/toast'

interface Entree {
  to: string
  libelle: string
  icone: IconDefinition
}

const ENTREES: Entree[] = [
  { to: '/admin/tableau-de-bord', libelle: 'Tableau de bord', icone: icone.statistiques },
  { to: '/admin/utilisateurs', libelle: 'Utilisateurs', icone: icone.utilisateurs },
  { to: '/admin/matchs', libelle: 'Matchs & preuves', icone: icone.match },
  { to: '/admin/litiges', libelle: 'Litiges', icone: icone.litige },
  { to: '/admin/paiements', libelle: 'Paiements', icone: icone.transfert },
  { to: '/admin/messages', libelle: 'Messages', icone: icone.messages },
  { to: '/admin/jeux-plateformes', libelle: 'Jeux & plateformes', icone: icone.catalogue },
  { to: '/admin/configurations', libelle: 'Configurations', icone: icone.reglages },
  { to: '/admin/journal-audit', libelle: 'Journal d’audit', icone: icone.tableau },
]

/** Coquille du tableau admin : sidebar dense (encre), navbar, contenu large. Mobile : menu volet. */
export function LayoutAdmin({ administrateur, children }: { administrateur: Administrateur; children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const chemin = useRouterState({ select: (s) => s.location.pathname })
  const reduit = useReducedMotion()
  const deconnecter = useServerFn(deconnexionAdmin)
  const navigate = useNavigate()
  const router = useRouter()
  const titre = ENTREES.find((e) => chemin.startsWith(e.to))?.libelle ?? 'Administration'

  // Le socket doit être celui de CET administrateur : la connexion se fait par navigation
  // interne, et laisserait sinon un socket de visiteur auquel le salon `admin` est refusé.
  useIdentiteTempsReel(administrateur.id)

  const queryClient = useQueryClient()

  const seDeconnecter = async () => {
    await deconnecter()
    // Cache vidé avant de naviguer : il contient les statistiques, les litiges, les paiements
    // et les fiches d'utilisateurs consultées. Sans cela, la session suivante ouverte dans le
    // même onglet les afficherait avant même de s'authentifier à nouveau.
    queryClient.clear()
    toastSucces('Session administrateur fermée.')
    await router.invalidate()
    await navigate({ to: '/admin/connexion' })
  }

  const navigation = (
    <nav className="flex-1 py-2" aria-label="Administration">
      {ENTREES.map((e) => (
        <Link
          key={e.to}
          to={e.to}
          onClick={() => setMenu(false)}
          className="mx-2 flex h-11 items-center gap-3 rounded-xl px-3 text-legende transition-colors"
          activeProps={{ className: 'bg-vert font-semibold text-craie' }}
          inactiveProps={{ className: 'text-craie/70 hover:bg-craie/8 hover:text-craie' }}
        >
          <FontAwesomeIcon icon={e.icone} fixedWidth className="text-sm" />
          <span>{e.libelle}</span>
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-dvh bg-craie">
      {/* Un seul abonnement au salon `admin` pour tout l'espace : compteurs, files et toasts
          restent vivants quelle que soit la page ouverte. Aucun rendu. */}
      <AbonnementAdmin />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col bg-encre text-craie lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-craie/15 px-5">
          <Logo ton="clair" taille="sm" lien={false} />
          <span className="etiquette ml-auto rounded-full bg-volt px-2 py-0.5 text-nuit">Admin</span>
        </div>
        {navigation}
        <div className="border-t border-craie/15 px-5 py-4 text-legende">
          <p className="truncate font-semibold">{administrateur.nom}</p>
          <p className="truncate text-[11px] text-craie/50">{administrateur.email}</p>
          <button type="button" onClick={() => void seDeconnecter()} className="mt-3 flex items-center gap-2 text-[12px] text-craie/70 hover:text-volt">
            <FontAwesomeIcon icon={icone.deconnexion} /> Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-trait bg-craie px-4 shadow-barre sm:px-6">
          {/* Sur téléphone le titre est MASQUÉ, pas rogné : « JEUX & PLATEFORMES » en Unbounded
              demande 221 px quand il n'en reste que 176, et un « JEUX & PLATEF… » permanent
              n'apprend rien. Le nom de l'écran est de toute façon repris juste en dessous par
              `EnTetePage` ; la marque prend sa place pour que la barre garde une identité. */}
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu} className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-trait bg-papier transition-colors hover:bg-gris lg:hidden">
              <FontAwesomeIcon icon={menu ? icone.fermer : icone.menu} />
            </button>
            <Logo variante="marque" taille="sm" className="sm:hidden" />
            <h1 className="hidden min-w-0 truncate text-h3 sm:block">{titre}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Remplace tout texte du type « actualisé toutes les 60 s » : plus rien n'est
                interrogé en boucle, le serveur pousse. Cliquable pour forcer une reconnexion. */}
            <IndicateurDirect variante="etiquette" avecCompteur cliquable />
            <Link to="/" className="etiquette hidden items-center gap-1 rounded-full border border-transparent px-3 py-1.5 transition-colors hover:border-trait hover:bg-gris sm:flex">
              Site public <FontAwesomeIcon icon={icone.suivant} />
            </Link>
          </div>
        </header>
        {/* Aucune transition entre deux écrans d'administration : le contenu est remplacé
            sèchement. Les seules animations qui restent dans cette coquille sont celles du
            tiroir de menu ci-dessous, déclenchées par un geste et non par une navigation. */}
        <main className="flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-40 flex lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduit ? 0 : 0.15 }}>
            <button type="button" aria-label="Fermer le menu" className="flex-1 bg-voile" onClick={() => setMenu(false)} />
            <motion.aside className="flex w-[260px] flex-col rounded-l-2xl bg-encre text-craie" initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} transition={{ duration: reduit ? 0 : 0.18 }}>
              <div className="flex h-14 items-center border-b border-craie/15 px-5">
                <Logo ton="clair" taille="sm" lien={false} />
              </div>
              {navigation}
              <button type="button" onClick={() => void seDeconnecter()} className="flex items-center gap-2 border-t border-craie/15 px-5 py-4 text-legende text-craie/70">
                <FontAwesomeIcon icon={icone.deconnexion} /> Déconnexion
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

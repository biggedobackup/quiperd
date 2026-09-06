import { Link } from '@tanstack/react-router'
import { Logo } from '@/components/partages/logo/logo'

const LIENS_PLATEFORME = [
  { to: '/defis', libelle: 'Défis ouverts' },
  { to: '/jeux', libelle: 'Jeux & plateformes' },
  { to: '/comment-ca-marche', libelle: 'Comment ça marche' },
  { to: '/aide', libelle: 'Aide & FAQ' },
] as const

const LIENS_LEGAL = [
  { to: '/cgu', libelle: 'Conditions générales' },
  { to: '/confidentialite', libelle: 'Confidentialité' },
  { to: '/mentions-legales', libelle: 'Mentions légales' },
] as const

/** Pied de page : un joueur connecté voit « Mon espace », jamais « Créer un compte ». */
export function Footer({ connecte }: { connecte: boolean }) {
  const colonnes = [
    {
      titre: 'Plateforme',
      liens: [...LIENS_PLATEFORME, connecte ? { to: '/joueur/tableau-de-bord', libelle: 'Mon espace' } : { to: '/inscription', libelle: 'Créer un compte' }],
    },
    { titre: 'Légal', liens: [...LIENS_LEGAL] },
  ] as const
  return (
    <footer className="border-t-2 border-encre bg-nuit text-craie">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo ton="clair" taille="lg" />
          <p className="max-w-sm text-legende text-craie/70">
            Des défis entre gamers, sur tous les jeux compétitifs. Les mises sont conservées en séquestre le temps du match, le
            gagnant remporte tout.
          </p>
          <p className="etiquette text-volt">Jeu réservé aux adultes · misez de manière responsable</p>
        </div>
        {colonnes.map((c) => (
          <div key={c.titre}>
            <h3 className="etiquette mb-4 text-craie/60">{c.titre}</h3>
            <ul className="space-y-2.5">
              {c.liens.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-legende text-craie transition-colors hover:text-volt">
                    {l.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-craie/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-legende text-craie/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="chiffres">© {new Date().getFullYear()} QUI PERD</span>
        </div>
      </div>
    </footer>
  )
}

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
      liens: [
        ...LIENS_PLATEFORME,
        connecte ? { to: '/joueur/tableau-de-bord', libelle: 'Mon espace' } : { to: '/inscription', libelle: 'Créer un compte' },
      ],
    },
    { titre: 'Légal', liens: [...LIENS_LEGAL] },
  ] as const

  return (
    <footer className="border-t border-trait bg-craie">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo taille="lg" />
          <p className="max-w-sm text-legende text-muet">
            Des défis entre gamers, sur tous les jeux compétitifs. Les mises sont conservées en séquestre le temps du match, le
            gagnant remporte tout.
          </p>
          <p className="etiquette text-vert">
            Jeu réservé aux adultes · misez de manière responsable
          </p>
        </div>
        {colonnes.map((c) => (
          <div key={c.titre}>
            <h3 className="etiquette mb-3 text-muet">{c.titre}</h3>
            <ul className="space-y-0.5">
              {c.liens.map((l) => (
                <li key={l.to}>
                  {/*
                    `min-h-11` : sur téléphone, des liens de 18 px empilés se manquent au doigt.
                    La zone cliquable est portée à 44 px sans changer la taille du texte ; l'espacement
                    de la liste est réduit d'autant (`space-y-0.5`) pour que le pied de page ne gonfle pas.
                  */}
                  <Link to={l.to} className="inline-flex min-h-11 items-center text-legende text-encre transition-colors hover:text-vert">
                    {l.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-trait">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-legende text-muet sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="chiffres">© {new Date().getFullYear()} QUI PERD</span>
        </div>
      </div>
    </footer>
  )
}

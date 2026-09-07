import { Suspense, lazy, useEffect, useState } from 'react'

export interface Barre {
  nom: string
  valeur: number
  /** Couleur de la barre (token CSS). */
  couleur?: string
}

export interface ProprietesGraphique {
  titre: string
  donnees: Barre[]
  format?: 'entier' | 'montant'
  hauteur?: number
}

/**
 * Répartition en barres plates. Le tracé lui-même (Recharts, plus de 350 Ko) est dans un
 * module séparé, chargé **après** le montage : le tableau de bord s'affiche et devient
 * utilisable sans attendre la bibliothèque de graphiques, qui arrive ensuite à la place du
 * rectangle de chargement. Rendu client uniquement de toute façon : `ResponsiveContainer`
 * n'a aucune largeur au rendu serveur.
 */
const GraphiqueCorps = lazy(() => import('./graphique-corps'))

export function GraphiqueRepartition({ titre, donnees, format = 'entier', hauteur = 220 }: ProprietesGraphique) {
  const [monte, setMonte] = useState(false)
  useEffect(() => setMonte(true), [])

  const attente = <div className="h-full animate-pulsation bg-trait/40" aria-hidden="true" />

  return (
    <div className="border-2 border-encre bg-papier p-5">
      <h3 className="etiquette text-muet">{titre}</h3>
      <div className="mt-4" style={{ height: hauteur }}>
        {monte ? (
          <Suspense fallback={attente}>
            <GraphiqueCorps donnees={donnees} format={format} />
          </Suspense>
        ) : (
          attente
        )}
      </div>
    </div>
  )
}

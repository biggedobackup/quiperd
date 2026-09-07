import type { KeyboardEvent, ReactNode } from 'react'
import { SkeletonLignes } from '../skeleton/skeleton'
import { useAttenteDouce } from '../skeleton/attente'

export interface Colonne<T> {
  cle: string
  entete: ReactNode
  rendu: (ligne: T) => ReactNode
  /** Alignement à droite pour les montants. */
  droite?: boolean
  /** Masquée dans la vue carte mobile. */
  secondaire?: boolean
  className?: string
}

export interface ProprietesDataTable<T> {
  colonnes: Colonne<T>[]
  lignes: T[]
  cleLigne: (ligne: T) => string
  chargement?: boolean
  vide?: ReactNode
  /** Légende accessible du tableau. */
  legende: string
  onClicLigne?: (ligne: T) => void
}

/**
 * Rend une ligne (ou une carte) réellement activable : une `<tr>` ou un `<li>` qui ne porte
 * qu'un `onClick` est invisible au clavier et aux lecteurs d'écran. Un arbitre qui navigue
 * au clavier ne pourrait tout simplement pas ouvrir un litige.
 */
function proprietesActivation(activer: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      activer()
    },
  }
}

/**
 * Tableau dense (admin) : en-têtes en capitales, lignes 40 px, chiffres en mono alignés.
 * En mobile (< md), chaque ligne devient une carte « étiquette : valeur ».
 */
export function DataTable<T>({ colonnes, lignes, cleLigne, chargement = false, vide, legende, onClicLigne }: ProprietesDataTable<T>) {
  // Squelette différé pour TOUS les tableaux d'un coup : portefeuille, paiements,
  // utilisateurs, journal. Un chargement de quelques images ne doit rien faire
  // apparaître, et le squelette affiché ne doit pas battre de l'œil.
  const attente = useAttenteDouce(chargement)
  if (attente) return <SkeletonLignes colonnes={Math.min(colonnes.length, 5)} />
  if (chargement) return null
  if (lignes.length === 0) return <>{vide ?? <p className="border-2 border-dashed border-trait px-4 py-8 text-legende text-muet">Aucune donnée.</p>}</>

  return (
    <>
      {/* ≥ md : tableau */}
      <div className="hidden overflow-x-auto border-2 border-encre bg-papier md:block">
        <table className="w-full text-legende">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr className="border-b-2 border-encre bg-gris">
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  scope="col"
                  className={`etiquette px-3 py-2.5 text-left text-muet ${c.droite ? 'text-right' : ''} ${c.className ?? ''}`}
                >
                  {c.entete}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-trait">
            {lignes.map((l) => (
              <tr
                key={cleLigne(l)}
                onClick={onClicLigne ? () => onClicLigne(l) : undefined}
                {...(onClicLigne ? proprietesActivation(() => onClicLigne(l)) : {})}
                className={`h-10 transition-colors ${onClicLigne ? 'cursor-pointer hover:bg-volt-fond focus-visible:bg-volt-fond focus-visible:outline-2 focus-visible:outline-encre' : 'hover:bg-gris'}`}
              >
                {colonnes.map((c) => (
                  <td key={c.cle} className={`px-3 py-2 align-middle ${c.droite ? 'chiffres text-right' : ''} ${c.className ?? ''}`}>
                    {c.rendu(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* < md : cartes */}
      <ul className="space-y-3 md:hidden">
        {lignes.map((l) => (
          <li
            key={cleLigne(l)}
            onClick={onClicLigne ? () => onClicLigne(l) : undefined}
            {...(onClicLigne ? proprietesActivation(() => onClicLigne(l)) : {})}
            className={`ticket-sm border-2 border-encre bg-papier p-4 ${onClicLigne ? 'cursor-pointer active:bg-volt-fond focus-visible:outline-2 focus-visible:outline-encre' : ''}`}
          >
            <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-2 text-legende">
              {colonnes
                .filter((c) => !c.secondaire)
                .map((c) => (
                  <div key={c.cle} className="contents">
                    <dt className="etiquette text-muet">{c.entete}</dt>
                    <dd className={c.droite ? 'chiffres text-right' : ''}>{c.rendu(l)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

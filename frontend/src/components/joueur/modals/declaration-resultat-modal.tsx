import { useEffect, useState } from 'react'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Textarea } from '@/components/partages/textarea/textarea'
import type { Declaration, ResultatDeclarable } from '@/models/match'

export interface ProprietesDeclarationResultatModal {
  ouvert: boolean
  onFermer: () => void
  onDeclarer: (d: Declaration) => Promise<void>
  adversaire: string
  chargement?: boolean
  /** Manche en cours : affichée dès qu'il y a eu un rejeu. */
  manche?: number
  /** L'adversaire a déjà déclaré : le vocabulaire change (« proposer » plutôt que « déclarer »). */
  contreProposition?: boolean
}

/**
 * Déclaration de fin de match, la même pour tous les jeux : le joueur désigne l'issue de sa
 * partie. On ne demande aucun score chiffré — la moitié du catalogue n'en produit pas (un
 * combat, une course, une partie de cartes), et le demander revenait à faire inventer un
 * « 1-0 » sur une plateforme où l'on mise de l'argent. Qui tient à noter le score de sa
 * partie l'écrit dans le commentaire.
 *
 * Le « match nul » reste offert : deux joueurs peuvent tomber d'accord pour dire que la
 * partie n'a pas départagé (déconnexion, égalité de temps), et la machine à états sait déjà
 * quoi en faire — rejouer la manche ou partager les mises.
 */
export function DeclarationResultatModal({
  ouvert,
  onFermer,
  onDeclarer,
  adversaire,
  chargement = false,
  manche = 1,
  contreProposition = false,
}: ProprietesDeclarationResultatModal) {
  const [resultat, setResultat] = useState<ResultatDeclarable | null>(null)
  const [commentaire, setCommentaire] = useState('')

  // Remise à zéro à chaque ouverture : on ne réutilise jamais le choix d'une manche passée.
  useEffect(() => {
    if (ouvert) {
      setResultat(null)
      setCommentaire('')
    }
  }, [ouvert])

  const description = contreProposition
    ? 'Votre adversaire a déjà déclaré. Si vous annoncez la même issue que lui, le match est réglé sur-le-champ ; sinon une preuve sera exigée des deux côtés.'
    : 'Une seule déclaration par joueur et par manche, définitive. Si votre adversaire annonce la même issue, le match est réglé immédiatement — sans preuve ni arbitre.'

  const choix: Array<{ valeur: ResultatDeclarable; libelle: string; aide: string }> = [
    { valeur: 'gagne', libelle: 'J’ai gagné', aide: `Vous déclarez avoir battu ${adversaire}.` },
    { valeur: 'perdu', libelle: 'J’ai perdu', aide: `Vous déclarez que ${adversaire} l’a emporté.` },
    {
      valeur: 'nul',
      libelle: 'Match nul',
      aide: 'La partie n’a pas départagé : vous choisirez ensuite de rejouer ou de partager les mises.',
    },
  ]

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre={
        contreProposition
          ? 'Déclarer un autre résultat'
          : manche > 1
            ? `Déclarer le résultat — manche ${manche}`
            : 'Déclarer le résultat'
      }
      description={description}
      verrouille={chargement}
    >
      <div className="space-y-5">
        <fieldset className="space-y-2.5">
          <legend className="etiquette mb-2 text-muet">Issue de la partie</legend>
          {choix.map((c) => (
            <label
              key={c.valeur}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                resultat === c.valeur ? 'border-vert bg-vert-pale' : 'border-trait bg-papier hover:border-vert'
              }`}
            >
              <input
                type="radio"
                name="resultat"
                value={c.valeur}
                checked={resultat === c.valeur}
                onChange={() => setResultat(c.valeur)}
                className="mt-1 size-4 shrink-0 accent-vert"
              />
              <span className="min-w-0">
                <span className="block font-titre text-[13px] uppercase">{c.libelle}</span>
                <span className="mt-0.5 block text-legende text-muet">{c.aide}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Textarea
          label="Commentaire (optionnel)"
          placeholder="Ex. adversaire déconnecté au troisième round."
          rows={3}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          maxLength={300}
        />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variante="fantome" bloc className="sm:w-auto" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button
            variante="volt"
            taille="lg"
            bloc
            className="sm:w-auto"
            chargement={chargement}
            disabled={!resultat}
            onClick={() => resultat && void onDeclarer({ resultat, commentaire: commentaire.trim() || undefined })}
          >
            {resultat ? choix.find((c) => c.valeur === resultat)!.libelle : 'Choisissez une issue'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

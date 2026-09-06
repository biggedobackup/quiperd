/**
 * Indicateur discret de l'état du direct. Il REMPLACE tout texte du type
 * « liste actualisée toutes les 30 secondes » : la page n'interroge plus le serveur, c'est le
 * serveur qui pousse — l'utilisateur doit seulement savoir si le fil est vivant.
 *
 * Fond blanc, pastille carrée verte (`volt`) qui pulse en direct, ambre en reconnexion, rouge
 * hors ligne. Zéro dégradé. Confortable en mobile : texte lisible sans zoom et, quand il est
 * cliquable (bouton « reconnecter »), cible tactile de 44 px.
 *
 * Ce composant n'est inséré nulle part par défaut : chaque écran le place où il veut.
 */
import { useTempsReel, useClientTempsReel } from './hooks'

type StatutAffiche = 'direct' | 'reconnexion' | 'attente' | 'hors_ligne'

const APPARENCE: Record<StatutAffiche, { libelle: string; point: string; texte: string; pulse: boolean }> = {
  direct: { libelle: 'En direct', point: 'bg-volt', texte: 'text-encre', pulse: true },
  reconnexion: { libelle: 'Reconnexion…', point: 'bg-alerte', texte: 'text-alerte', pulse: true },
  attente: { libelle: 'Connexion…', point: 'bg-muet', texte: 'text-muet', pulse: false },
  hors_ligne: { libelle: 'Hors ligne', point: 'bg-perte', texte: 'text-perte', pulse: false },
}

export interface ProprietesIndicateurDirect {
  className?: string
  /** Ajoute « · N en ligne » dès que le serveur pousse `compteur.en_ligne`. */
  avecCompteur?: boolean
  /** `compact` : pastille + libellé. `etiquette` : encadré façon badge (en-tête de page). */
  variante?: 'compact' | 'etiquette'
  /** Rend l'indicateur cliquable quand la connexion est perdue (relance immédiate). */
  cliquable?: boolean
}

export function IndicateurDirect({
  className = '',
  avecCompteur = false,
  variante = 'compact',
  cliquable = false,
}: ProprietesIndicateurDirect) {
  const { etat, generation, tentatives, joueursEnLigne } = useTempsReel()
  const client = useClientTempsReel()

  // Avant la première tentative (rendu serveur et premier rendu client), on annonce
  // « Connexion… » plutôt que « Hors ligne » : rien n'a encore échoué.
  const vierge = generation === 0 && tentatives === 0
  const statut: StatutAffiche =
    etat === 'connecte' ? 'direct' : vierge ? 'attente' : etat === 'hors_ligne' ? 'hors_ligne' : 'reconnexion'
  const apparence = APPARENCE[statut]

  const compteur = avecCompteur && joueursEnLigne !== null ? ` · ${joueursEnLigne} en ligne` : ''
  const relancable = cliquable && statut !== 'direct' && statut !== 'attente'

  // Une seule classe par propriété CSS : deux utilitaires de padding (ou de hauteur) sur le
  // même élément se disputent selon l'ordre du fichier CSS, pas selon l'ordre des classes.
  const cadre = variante === 'etiquette' ? 'border border-current/20' : ''
  const espacement = relancable ? 'min-h-11 px-3' : variante === 'etiquette' ? 'h-6 px-2' : ''
  const socle = `etiquette inline-flex items-center gap-1.5 bg-craie ${apparence.texte} ${cadre} ${espacement}`

  const contenu = (
    <>
      <span
        className={`inline-block size-2 shrink-0 ${apparence.point} ${apparence.pulse ? 'animate-pulsation' : ''}`}
        aria-hidden="true"
      />
      <span>
        {apparence.libelle}
        {compteur}
      </span>
    </>
  )

  if (relancable) {
    return (
      <button
        type="button"
        onClick={() => client.reconnecterMaintenant()}
        aria-label="Reconnecter le direct"
        className={`${socle} transition-colors hover:bg-gris ${className}`}
      >
        {contenu}
      </button>
    )
  }

  return (
    <span role="status" aria-live="polite" className={`${socle} ${className}`}>
      {contenu}
    </span>
  )
}

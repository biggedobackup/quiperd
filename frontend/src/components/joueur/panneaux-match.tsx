/**
 * Panneaux d'état de l'écran de match : ce que le joueur doit faire (ou attendre) à l'instant
 * présent. Chacun porte son propre compte à rebours, alimenté par l'échéance du serveur.
 *
 * Mobile d'abord : ces blocs sont les premiers du flux, l'action principale est en bas du bloc,
 * pleine largeur et 44 px minimum.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import type { ChoixNulValeur } from '@/models/match'
import { Button } from '@/components/partages/button/button'
import { CompteARebours } from './compte-a-rebours'
import { UploadPreuve } from './upload-preuve'

/** J'ai déclaré, l'adversaire n'a pas encore répondu. */
export function PanneauAttente({
  nomAdversaire,
  echeance,
  surFinChrono,
}: {
  nomAdversaire: string
  echeance?: string | null
  surFinChrono: () => void
}) {
  return (
    <section className="ticket-sm border-2 border-encre bg-papier px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-legende font-semibold">
          <FontAwesomeIcon icon={icone.sablier} className="animate-pulsation text-muet" aria-hidden="true" />
          Score déclaré — en attente de {nomAdversaire}
        </p>
        <CompteARebours echeance={echeance} libelle="Il lui reste" ton="neutre" surFin={surFinChrono} />
      </div>
      <p className="mt-2 text-legende text-muet">
        S’il confirme, le match est réglé sur-le-champ. S’il ne répond pas avant l’échéance, votre déclaration fera foi
        et le règlement se fera en votre faveur.
      </p>
    </section>
  )
}

/** Nul déclaré des deux côtés : rejouer la manche ou partager les mises. */
export function PanneauNul({
  monChoix,
  choixAdverse,
  nomAdversaire,
  echeance,
  surFinChrono,
  onOuvrir,
}: {
  monChoix?: ChoixNulValeur
  choixAdverse?: ChoixNulValeur
  nomAdversaire: string
  echeance?: string | null
  surFinChrono: () => void
  onOuvrir: () => void
}) {
  return (
    <section className="ticket border-2 border-alerte bg-alerte-fond px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="etiquette flex items-center gap-2 text-alerte">
          <FontAwesomeIcon icon={icone.poigneeDeMain} aria-hidden="true" />
          Match nul déclaré
        </span>
        <CompteARebours echeance={echeance} libelle="Partage dans" ton="alerte" surFin={surFinChrono} />
      </div>
      <h3 className="mt-3 text-h3">Rejouer la manche, ou partager les mises ?</h3>
      <p className="mt-2 text-legende">
        Rejouer n’a lieu que si vous êtes <strong>tous les deux</strong> d’accord — sans mouvement d’argent, vos mises
        restent bloquées. Sinon, ou si le délai s’écoule, les mises sont partagées : chacun récupère la sienne moins la
        commission de la plateforme.
      </p>
      {choixAdverse && (
        <p className="mt-3 text-legende text-alerte">
          {nomAdversaire} a choisi <strong>{choixAdverse === 'rejouer' ? 'de rejouer' : 'de partager'}</strong>.
        </p>
      )}
      {monChoix ? (
        <p className="mt-4 flex items-center gap-2 border-2 border-encre bg-papier px-3 py-2.5 text-legende">
          <FontAwesomeIcon icon={icone.valider} className="text-gain" aria-hidden="true" />
          Votre choix est enregistré : <strong>{monChoix === 'rejouer' ? 'rejouer' : 'partager'}</strong>. En attente de{' '}
          {nomAdversaire}.
        </p>
      ) : (
        <Button variante="volt" taille="lg" bloc className="mt-4 sm:w-auto" onClick={onOuvrir} iconeDebut={icone.echange}>
          Faire mon choix
        </Button>
      )}
    </section>
  )
}

/** Déclarations divergentes : preuve exigée des deux côtés, puis arbitrage. */
export function PanneauPreuveRequise({
  matchId,
  nomAdversaire,
  jaiEnvoye,
  adversaireAEnvoye,
  echeance,
  surFinChrono,
  onEnvoye,
}: {
  matchId: string
  nomAdversaire: string
  jaiEnvoye: boolean
  adversaireAEnvoye: boolean
  echeance?: string | null
  surFinChrono: () => void
  onEnvoye: () => void
}) {
  return (
    <section className="ticket border-2 border-alerte bg-papier">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-alerte bg-alerte-fond px-4 py-2.5">
        <span className="etiquette flex items-center gap-2 text-alerte">
          <FontAwesomeIcon icon={icone.attention} aria-hidden="true" />
          Preuve exigée
        </span>
        <CompteARebours echeance={echeance} libelle="Il reste" ton="alerte" surFin={surFinChrono} />
      </div>
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-h3">Vos déclarations ne concordent pas</h3>
        <p className="mt-2 text-legende">
          Chacun doit envoyer une preuve du résultat (capture d’écran ou vidéo de fin de partie). Dès que les deux
          preuves sont déposées — ou à l’expiration du délai — un arbitre les examine et tranche. Les mises restent
          bloquées jusque-là.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <EtatPreuve nom="Votre preuve" fait={jaiEnvoye} />
          <EtatPreuve nom={`Preuve de ${nomAdversaire}`} fait={adversaireAEnvoye} />
        </ul>
        <div className="mt-4">
          <UploadPreuve matchId={matchId} onEnvoye={onEnvoye} />
        </div>
      </div>
    </section>
  )
}

function EtatPreuve({ nom, fait }: { nom: string; fait: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 border-2 px-3 py-2 text-legende ${
        fait ? 'border-gain bg-gain-fond text-gain' : 'border-trait bg-gris text-muet'
      }`}
    >
      <FontAwesomeIcon icon={fait ? icone.valider : icone.sablier} aria-hidden="true" />
      <span className="min-w-0 truncate">
        {nom} — {fait ? 'envoyée' : 'attendue'}
      </span>
    </li>
  )
}

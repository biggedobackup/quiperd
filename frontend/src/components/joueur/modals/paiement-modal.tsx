import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'

/**
 * Page de paiement du prestataire, affichée **dans** la plateforme.
 *
 * Le joueur ne quitte plus QUI PERD pour payer : la page hébergée s'ouvre dans un
 * cadre, et le portefeuille reste monté derrière — socket connecté. C'est ce qui
 * permet de refermer cette fenêtre tout seul dès que `paiement.statut` arrive, sans
 * que le joueur ait à revenir par lui-même.
 *
 * Le cadre reste un pis-aller technique : si le prestataire venait un jour à
 * interdire l'encadrement (`X-Frame-Options`), le cadre resterait blanc. D'où le
 * lien « nouvel onglet », toujours proposé.
 */
export function PaiementModal({ ouvert, url, onFermer }: { ouvert: boolean; url: string | null; onFermer: () => void }) {
  return (
    <Modal
      ouvert={ouvert && !!url}
      onFermer={onFermer}
      titre="Paiement Mobile Money"
      description="Validez le paiement ci-dessous ; votre solde se met à jour ici même, sans recharger la page."
      taille="lg"
    >
      <div className="space-y-4">
        {url && (
          <iframe
            src={url}
            title="Page de paiement sécurisée du prestataire"
            // `allow` autorise le prestataire à ouvrir l'application Mobile Money du
            // téléphone quand l'opérateur le propose.
            allow="payment *; clipboard-write"
            className="-mx-5 h-[68dvh] w-[calc(100%+2.5rem)] border-2 border-trait bg-papier sm:mx-0 sm:w-full"
          />
        )}
        <p className="text-legende text-muet">
          Ne fermez pas cette fenêtre avant d’avoir validé la demande sur votre téléphone. Si la page ne s’affiche pas,{' '}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-vert underline">
              ouvrez-la dans un nouvel onglet
            </a>
          )}
          .
        </p>
        <div className="flex justify-end">
          <Button variante="fantome" onClick={onFermer}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  )
}

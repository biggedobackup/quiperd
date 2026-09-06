/**
 * Blocage « adresse e-mail non confirmée » — une seule source de vérité pour tout l'espace
 * joueur : le bandeau de rappel du layout, le bloc d'explication affiché AVANT un formulaire
 * qui serait refusé, et la traduction du 403 renvoyé par le backend.
 *
 * L'état vient de la session du layout `/joueur` (`GET /api/auth/moi`, `beforeLoad`) : après la
 * confirmation, un `router.invalidate()` relit cette session et tout disparaît sans rechargement.
 */
import { getRouteApi } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import type { Utilisateur } from '@/models/utilisateur'
import type { EchecResultat } from '@/server/http-client'
import { LienBouton } from '@/components/partages/button/button'
import { toastAttention } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

/**
 * `true` uniquement si le serveur dit explicitement que l'adresse n'est pas confirmée.
 * Volontairement `=== false` et non `!emailVerifie` : une réponse sans le champ (backend
 * antérieur à ce contrat) ne doit bloquer personne ni faire clignoter un bandeau à tort.
 */
export function emailNonConfirme(utilisateur: Pick<Utilisateur, 'emailVerifie'>): boolean {
  return utilisateur.emailVerifie === false
}

/** Idem, depuis la session du layout joueur — utilisable dans n'importe quel écran de `/joueur`. */
export function useEmailNonConfirme(): boolean {
  const { session } = routeJoueur.useRouteContext()
  return emailNonConfirme(session.utilisateur)
}

/**
 * Le backend a refusé l'action parce que l'adresse n'est pas confirmée : création et jonction
 * d'un défi, demande de retrait. Ces routes sont déjà authentifiées et réservées aux joueurs,
 * le seul 403 qu'elles savent produire est celui-là.
 */
export function estRefusEmail(echec: EchecResultat): boolean {
  return echec.statut === 403
}

/** Toast du 403 : le titre situe la cause, le corps reprend le message exact du backend. */
export function toastRefusEmail(echec: EchecResultat): void {
  toastAttention('Adresse e-mail non confirmée', echec.message)
}

/**
 * Bandeau de rappel de l'espace joueur. Sobre : un filet ambre, une phrase, un lien — il ne
 * couvre rien et ne se referme pas (la confirmation, elle, le fait disparaître).
 */
export function BandeauEmailNonConfirme({ email }: { email: string }) {
  return (
    <div role="status" className="border-b-2 border-alerte bg-alerte-fond px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 text-legende text-alerte">
        <FontAwesomeIcon icon={icone.courriel} className="shrink-0" aria-hidden="true" />
        {/* L'adresse n'apparaît qu'à partir de `sm` : sur un téléphone elle ferait passer le
            bandeau sur trois lignes, alors que l'écran de confirmation la rappelle en grand. */}
        <p className="min-w-0 font-semibold">
          Adresse e-mail à confirmer
          <span className="hidden font-normal break-all sm:inline"> — code envoyé à {email}</span>
        </p>
        <LienBouton
          to="/joueur/confirmation-email"
          variante="lien"
          taille="sm"
          className="ml-auto h-11! px-0! text-alerte sm:h-9!"
        >
          Saisir le code
        </LienBouton>
      </div>
    </div>
  )
}

/**
 * Bloc affiché à la place (ou au-dessus) d'une action interdite tant que l'adresse n'est pas
 * confirmée : on l'explique avant que le joueur remplisse quoi que ce soit, et on propose le
 * seul geste utile.
 *
 * @param action  Ce qui est bloqué, à l'infinitif : « créer un défi », « rejoindre ce défi ».
 * @param vers    Écran de l'espace joueur à rouvrir une fois le code saisi.
 * @param note    Précision propre à l'écran (ex. « le dépôt, lui, reste possible »).
 */
export function BlocEmailNonConfirme({
  action,
  vers,
  note,
  className = '',
}: {
  action: string
  vers?: string
  note?: string
  className?: string
}) {
  const { session } = routeJoueur.useRouteContext()
  return (
    <section className={`ticket border-2 border-alerte bg-papier p-4 sm:p-6 ${className}`} aria-labelledby="titre-email-non-confirme">
      <div className="flex items-start gap-3">
        <span className="ticket-sm flex size-11 shrink-0 items-center justify-center bg-alerte-fond text-alerte" aria-hidden="true">
          <FontAwesomeIcon icon={icone.courriel} />
        </span>
        <div className="min-w-0">
          <h3 id="titre-email-non-confirme" className="text-h3">
            Confirmez votre adresse e-mail
          </h3>
          <p className="mt-2 text-legende text-muet">
            Avant de {action}, nous devons vérifier que <strong className="break-all text-encre">{session.utilisateur.email}</strong> est bien à vous — de
            l’argent réel transite par ce compte. Un code à 6 chiffres vous a été envoyé ; la confirmation ne prend qu’une fois.
          </p>
          {note && <p className="mt-2 text-legende text-muet">{note}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-trait pt-4">
        <LienBouton
          to="/joueur/confirmation-email"
          search={{ vers }}
          variante="volt"
          iconeDebut={icone.cle}
          className="w-full sm:w-auto"
        >
          Saisir mon code
        </LienBouton>
      </div>
    </section>
  )
}

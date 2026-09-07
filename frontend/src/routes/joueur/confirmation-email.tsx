/**
 * Confirmation de l'adresse e-mail — `POST /api/auth/verification-email`.
 *
 * Pourquoi cet écran vit sous `/joueur` et non dans `_public` : la route backend est
 * authentifiée (Bearer), le compte existe déjà et le joueur est connecté. Le layout `/joueur`
 * fournit la session (l'adresse à rappeler), la garde de rôle et le `noindex`. Confirmation
 * obligatoire : tant que l'adresse n'est pas confirmée, le layout `/joueur` renvoie ici tout
 * le reste de l'espace joueur — seuls cet écran et le profil sont accessibles.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { createFileRoute, getRouteApi, useNavigate, useRouter, type SearchSchemaInput } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { nombreDeLErreur } from '@/lib/formulaires'
import { confirmerEmail, renvoyerCodeEmail } from '@/services/auth'
import { useChrono } from '@/temps-reel/hooks'
import { emailNonConfirme } from '@/components/joueur/email-non-verifie'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button, LienBouton } from '@/components/partages/button/button'
import { toastErreur, toastInfo, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

/** Longueur du code envoyé par le backend. */
const LONGUEUR = 6
/** Tampon de saisie : toujours 6 caractères, une espace = case vide (les trous sont conservés). */
const VIDE = ' '.repeat(LONGUEUR)
/** Délai minimal entre deux envois côté backend — sert de repli quand il ne le précise pas. */
const DELAI_RENVOI = 60
/** Le temps de lire « adresse confirmée » avant que l'écran suivant s'affiche. */
const DELAI_REDIRECTION = 1200

/** Les seuls chiffres saisis, trous retirés — c'est ce qui part au backend. */
function chiffresDe(tampon: string): string {
  return tampon.replace(/\D/g, '')
}

export const Route = createFileRoute('/joueur/confirmation-email')({
  head: () => ({ meta: [{ title: 'Confirmer mon e-mail — QUI PERD' }, { name: 'robots', content: 'noindex' }] }),
  // `vers` : écran de l'espace joueur à rouvrir après confirmation (le défi qu'on voulait
  // rejoindre, le portefeuille…). `nouveau` : on arrive de l'inscription, un code vient de partir.
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput): { vers?: string; nouveau?: boolean } => ({
    vers: typeof s.vers === 'string' && s.vers.startsWith('/joueur/') ? s.vers : undefined,
    nouveau: s.nouveau === true || s.nouveau === 'true' || s.nouveau === 1 || s.nouveau === '1' ? true : undefined,
  }),
  component: PageConfirmationEmail,
})

function PageConfirmationEmail() {
  const { vers, nouveau } = Route.useSearch()
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const dejaConfirme = !emailNonConfirme(moi)
  const confirmer = useServerFn(confirmerEmail)
  const renvoyer = useServerFn(renvoyerCodeEmail)
  const navigate = useNavigate()
  const router = useRouter()

  const [tampon, setTampon] = useState(VIDE)
  /** Dernier refus : le texte vient du backend, le statut décide du conseil à donner. */
  const [erreur, setErreur] = useState<{ texte: string; statut: number } | null>(null)
  /** 429 : le backend refuse temporairement toute nouvelle tentative, insister n'aide pas. */
  const epuise = erreur?.statut === 429
  const [envoi, setEnvoi] = useState(false)
  const [renvoiEnCours, setRenvoiEnCours] = useState(false)
  const [succes, setSucces] = useState<'confirme' | 'deja' | null>(null)

  const code = chiffresDe(tampon)
  const complet = code.length === LONGUEUR

  // Compte à rebours du renvoi : une échéance posée par le client, égrenée par `useChrono`
  // (aucun appel réseau). Arrivé de l'inscription, un code vient de partir : on attend 60 s.
  const [echeanceRenvoi, setEcheanceRenvoi] = useState<string | null>(() =>
    nouveau ? new Date(Date.now() + DELAI_RENVOI * 1000).toISOString() : null,
  )
  const chronoRenvoi = useChrono(echeanceRenvoi)
  const renvoiBloque = echeanceRenvoi !== null && !chronoRenvoi.termine

  const destination = vers ?? '/joueur/tableau-de-bord'

  // Adresse déjà confirmée (bandeau cliqué deux fois, second onglet, retour arrière) : on ne
  // fait pas saisir un code pour rien.
  useEffect(() => {
    if (dejaConfirme) setSucces((precedent) => precedent ?? 'deja')
  }, [dejaConfirme])

  useEffect(() => {
    if (!succes) return
    const minuterie = window.setTimeout(() => void navigate({ href: destination }), DELAI_REDIRECTION)
    return () => window.clearTimeout(minuterie)
  }, [succes, destination, navigate])

  const soumettre = async () => {
    if (!complet || envoi) return
    setEnvoi(true)
    setErreur(null)
    const r = await confirmer({ data: { code } })
    setEnvoi(false)

    if (r.ok || r.statut === 409) {
      // 409 « déjà vérifié » n'est pas un échec pour le joueur : l'adresse est confirmée.
      setSucces(r.ok ? 'confirme' : 'deja')
      toastSucces(r.ok ? 'Adresse confirmée' : 'Adresse déjà confirmée', `Bienvenue dans l’arène, ${moi.nomUtilisateur}.`)
      // Relit `GET /api/auth/moi` : bandeau et blocages disparaissent sans rechargement.
      await router.invalidate()
      return
    }

    setTampon(VIDE)
    if (r.statut === 429) {
      setErreur({ texte: r.message, statut: 429 })
      toastErreur('Trop de tentatives', r.message)
      return
    }
    const restants = nombreDeLErreur(r, 'essaisRestants')
    setErreur({
      texte: restants === null ? r.message : `${r.message} Il vous reste ${restants} essai${restants > 1 ? 's' : ''}.`,
      statut: r.statut,
    })
  }

  const demanderUnAutreCode = async () => {
    if (renvoiBloque || renvoiEnCours) return
    setRenvoiEnCours(true)
    const r = await renvoyer()
    setRenvoiEnCours(false)

    if (!r.ok) {
      // 429 : un code est parti il y a moins d'une minute — on repart sur le délai annoncé.
      const attente = nombreDeLErreur(r, 'prochainEnvoiDans') ?? DELAI_RENVOI
      setEcheanceRenvoi(new Date(Date.now() + attente * 1000).toISOString())
      toastErreur(r.statut === 429 ? 'Un code vient déjà de partir' : 'Envoi impossible', r.message)
      return
    }
    setTampon(VIDE)
    setErreur(null)
    setEcheanceRenvoi(new Date(Date.now() + (r.donnees.prochainEnvoiDans ?? DELAI_RENVOI) * 1000).toISOString())
    toastInfo('Nouveau code envoyé', `Regardez la boîte de ${moi.email}, courriers indésirables compris.`)
  }

  if (succes) {
    return (
      <>
        <EnTetePage surtitre="Sécurité" titre="Adresse confirmée" />
        <div>
          <section className="rounded-2xl border border-gain bg-papier p-6 text-center sm:p-8">
            <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-gain-fond text-gain" aria-hidden="true">
              <FontAwesomeIcon icon={icone.succes} className="text-h2" />
            </span>
            <h3 className="mt-4 text-h2">Bienvenue dans l’arène, {moi.nomUtilisateur}</h3>
            <p className="mt-2 text-legende text-muet" role="status">
              {succes === 'deja'
                ? 'Votre adresse était déjà confirmée : rien de plus à faire.'
                : 'Votre adresse est confirmée. Vous pouvez créer un défi, en rejoindre un et demander un retrait.'}
            </p>
            <p className="mt-4 text-legende text-muet">Redirection en cours…</p>
            <Button variante="volt" className="mt-5" onClick={() => void navigate({ href: destination })} iconeFin={icone.suivant}>
              Continuer
            </Button>
          </section>
        </div>
      </>
    )
  }

  return (
    <>
      <EnTetePage
        surtitre="Sécurité"
        titre="Confirmez votre e-mail"
        description="De l’argent réel transite par votre compte : nous vérifions une seule fois que cette adresse est bien la vôtre."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-trait bg-papier p-4 sm:p-6">
          <span className="etiquette text-muet">Code envoyé à</span>
          <p className="chiffres mt-1 break-all text-corps font-bold">{moi.email}</p>
          <p className="mt-2 flex items-start gap-2 text-legende text-muet">
            <FontAwesomeIcon icon={icone.info} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Le message peut atterrir dans vos <strong className="font-semibold text-encre">courriers indésirables</strong> (spam) :
              pensez à les regarder avant de demander un nouveau code.
            </span>
          </p>

          <form
            className="mt-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void soumettre()
            }}
          >
            <SaisieCode
              tampon={tampon}
              onChanger={(t) => {
                setTampon(t)
                // Le rouge disparaît dès que le joueur repart d'un nouveau code.
                if (erreur) setErreur(null)
              }}
              onValider={() => void soumettre()}
              invalide={erreur !== null}
              desactive={envoi}
            />

            {erreur && (
              <div
                className={`mt-4 rounded-xl border px-3.5 py-2.5 text-legende ${epuise ? 'border-alerte bg-alerte-fond text-alerte' : 'border-perte bg-perte-fond text-perte'}`}
                role="alert"
              >
                <p className="font-semibold">{erreur.texte}</p>
                {/* Conseil seulement quand il s'applique : ni sur un 429, ni sur une panne réseau. */}
                {epuise ? (
                  <p className="mt-1">Patientez quelques minutes avant de réessayer.</p>
                ) : erreur.statut === 400 ? (
                  <p className="mt-1">Code expiré ou perdu ? Demandez-en un nouveau ci-dessous.</p>
                ) : null}
              </div>
            )}

            <Button type="submit" bloc taille="lg" variante="volt" className="mt-5" chargement={envoi} disabled={!complet} iconeFin={icone.valider}>
              Confirmer mon adresse
            </Button>
          </form>

          <div className="mt-5 flex flex-col gap-3 border-t border-trait pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-legende text-muet">Aucun message au bout de quelques minutes ?</p>
            <Button
              variante="secondaire"
              onClick={() => void demanderUnAutreCode()}
              disabled={renvoiBloque}
              chargement={renvoiEnCours}
              iconeDebut={icone.envoyer}
              className="w-full sm:w-auto"
            >
              {renvoiBloque && chronoRenvoi.pret ? `Renvoyer dans ${chronoRenvoi.secondes} s` : 'Renvoyer le code'}
            </Button>
          </div>
        </section>

        <aside className="h-fit rounded-2xl bg-encre p-5 text-craie">
          <span className="etiquette text-craie/60">En attendant</span>
          <ul className="mt-3 space-y-3 text-legende text-craie/80">
            <LigneAcces autorise>Déposer sur votre portefeuille</LigneAcces>
            <LigneAcces>Créer un défi</LigneAcces>
            <LigneAcces>Rejoindre un défi</LigneAcces>
            <LigneAcces>Demander un retrait</LigneAcces>
          </ul>
          <p className="mt-4 border-t border-craie/15 pt-4 text-[11px] text-craie/50">
            Mauvaise adresse ? Corrigez-la depuis votre profil : un nouveau code partira à la bonne.
          </p>
          <LienBouton to="/joueur/profil" variante="secondaire" taille="sm" bloc className="mt-3 min-h-11">
            Mon profil
          </LienBouton>
        </aside>
      </div>
    </>
  )
}

function LigneAcces({ children, autorise = false }: { children: string; autorise?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <FontAwesomeIcon
        icon={autorise ? icone.valider : icone.cadenas}
        className={`mt-0.5 shrink-0 ${autorise ? 'text-volt' : 'text-craie/40'}`}
        aria-hidden="true"
      />
      <span className={autorise ? 'text-craie' : ''}>
        {children}
        {!autorise && <span className="sr-only"> — bloqué tant que l’adresse n’est pas confirmée</span>}
      </span>
    </li>
  )
}

/**
 * Six cases d'un chiffre plutôt qu'un champ unique : au pouce, chaque case dépasse 44 px de large
 * sur un écran de 375 px, les chiffres restent lisibles en grand (univers « tableau d'affichage »)
 * et l'avancement se voit. Les deux gestes réels des gens sont couverts :
 *
 *  - **coller** le code entier depuis la boîte mail — `onPaste` remplit les six cases d'un coup,
 *    quelle que soit la case visée ;
 *  - **l'autoremplissage** du téléphone (`autocomplete="one-time-code"` sur chaque case, comme
 *    l'exige iOS pour répartir les chiffres) — une valeur multi-caractères reçue par `onChange`
 *    est répartie de la même façon, et aucun `maxLength` ne vient la tronquer.
 *
 * Le tampon fait toujours 6 caractères, une espace valant case vide : effacer la troisième case
 * ne décale pas les suivantes, et le bouton reste désactivé tant qu'il reste un trou.
 *
 * Pas de validation automatique à la sixième touche : les essais sont comptés par le backend,
 * un code mal collé ne doit pas en consommer un avant que le joueur ait pu se relire.
 */
function SaisieCode({
  tampon,
  onChanger,
  onValider,
  invalide,
  desactive,
}: {
  tampon: string
  onChanger: (tampon: string) => void
  onValider: () => void
  invalide: boolean
  desactive: boolean
}) {
  const champs = useRef<(HTMLInputElement | null)[]>([])

  const focaliser = (index: number) => champs.current[Math.max(0, Math.min(LONGUEUR - 1, index))]?.focus()

  /** Réécrit le tampon à partir de `depuis`, en conservant sa longueur fixe. */
  const ecrire = (depuis: number, chiffres: string) => {
    const cases = tampon.padEnd(LONGUEUR, ' ').slice(0, LONGUEUR).split('')
    for (let i = 0; i < chiffres.length && depuis + i < LONGUEUR; i += 1) cases[depuis + i] = chiffres[i]!
    onChanger(cases.join(''))
    focaliser(depuis + chiffres.length)
  }

  const surSaisie = (index: number, brut: string) => {
    const chiffres = brut.replace(/\D/g, '')
    if (chiffres === '') {
      ecrire(index, ' ')
      focaliser(index)
      return
    }
    // Deux caractères alors que la case en portait déjà un : c'est une frappe par-dessus.
    const actuel = (tampon[index] ?? ' ').trim()
    const utile = chiffres.length === 2 && actuel ? (chiffres[0] === actuel ? chiffres[1]! : chiffres[0]!) : chiffres
    ecrire(index, utile)
  }

  const surTouche = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onValider()
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      // Case pleine : on l'efface. Case vide : on efface la précédente et on y revient.
      const cible = (tampon[index] ?? ' ').trim() ? index : index - 1
      if (cible < 0) return
      ecrire(cible, ' ')
      focaliser(cible)
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focaliser(index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focaliser(index + 1)
    }
  }

  const surCollage = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const colle = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!colle) return
    e.preventDefault()
    // Un code complet collé depuis la boîte mail vaut pour tout le champ, quelle que soit la
    // case visée : personne ne vise la première case avant de coller.
    if (colle.length >= LONGUEUR) {
      onChanger(colle.slice(0, LONGUEUR))
      focaliser(LONGUEUR - 1)
      return
    }
    ecrire(index, colle)
  }

  return (
    <div role="group" aria-label={`Code de confirmation à ${LONGUEUR} chiffres`}>
      <span className="etiquette text-muet">Code à {LONGUEUR} chiffres</span>
      <div className="mt-2 grid grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: LONGUEUR }, (_, index) => {
          const chiffre = (tampon[index] ?? '').trim()
          return (
            <input
              key={index}
              ref={(element) => {
                champs.current[index] = element
              }}
              value={chiffre}
              onChange={(e) => surSaisie(index, e.target.value)}
              onKeyDown={(e) => surTouche(index, e)}
              onPaste={(e) => surCollage(index, e)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={desactive}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              aria-label={`Chiffre ${index + 1}`}
              aria-invalid={invalide || undefined}
              className={`chiffres h-14 w-full rounded-[10px] border bg-papier text-center text-h2 font-bold text-encre transition-colors duration-150 focus:border-vert focus:outline-none disabled:opacity-60 ${
                invalide ? 'border-perte' : chiffre ? 'border-encre' : 'border-trait'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}

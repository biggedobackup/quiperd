import { useEffect, useMemo, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { indicatifPays, optionsPaysGroupees, trouverPays } from '@/lib/pays'
import { creerUtilisateur, modifierUtilisateur } from '@/services/utilisateurs'
import type { ModificationUtilisateurAdmin, Utilisateur } from '@/models/utilisateur'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Select } from '@/components/partages/select/select'
import { toastErreur } from '@/components/partages/toast/toast'

export type ModeUtilisateurModal = 'creation' | 'edition'

const GROUPES_PAYS = optionsPaysGroupees()
const OPTIONS_STATUT = [
  { valeur: 'actif', libelle: 'Actif' },
  { valeur: 'suspendu', libelle: 'Suspendu' },
]
/** Longueur minimale d'un mot de passe fixé par l'administrateur. */
const MOT_DE_PASSE_MIN = 8
/** Indicatif seul (issu du préremplissage) : équivaut à « pas de numéro ». */
const INDICATIF_SEUL = /^\+\d{1,4}$/
/** Format international permissif : « + » facultatif puis 7 à 20 chiffres, espaces, points ou tirets. */
const TELEPHONE_VALIDE = /^\+?\d[\d\s.-]{6,19}$/

/** Numéro nettoyé, ou chaîne vide s'il est vide ou réduit à l'indicatif. */
function nettoyerTelephone(valeur: string | undefined): string {
  const t = (valeur ?? '').trim()
  return t === '' || INDICATIF_SEUL.test(t) ? '' : t
}

/** Mot de passe obligatoire à la création ; en édition, vide = inchangé (sinon même longueur minimale). */
function construireSchema(edition: boolean) {
  return z.object({
    nomUtilisateur: z.string().trim().min(3, MESSAGES.pseudo).max(50, MESSAGES.pseudo),
    email: z.email(MESSAGES.email),
    motDePasse: z
      .string()
      .optional()
      .superRefine((v, ctx) => {
        const mdp = v ?? ''
        if (mdp === '') {
          if (!edition) ctx.addIssue({ code: 'custom', message: MESSAGES.requis })
        } else if (mdp.length < MOT_DE_PASSE_MIN) {
          ctx.addIssue({ code: 'custom', message: `${MOT_DE_PASSE_MIN} caractères minimum` })
        }
      }),
    telephone: z
      .string()
      .optional()
      .refine((v) => {
        const t = nettoyerTelephone(v)
        return t === '' || TELEPHONE_VALIDE.test(t)
      }, 'Numéro invalide (format international, ex. +225 07 00 00 00 00)'),
    pays: z.string().optional(),
    statut: z.enum(['actif', 'suspendu']),
  })
}
type Valeurs = z.infer<ReturnType<typeof construireSchema>>

function valeursInitiales(u: Utilisateur | null): Valeurs {
  return {
    nomUtilisateur: u?.nomUtilisateur ?? '',
    email: u?.email ?? '',
    motDePasse: '',
    telephone: u?.telephone ?? '',
    // Pays ramené à la liste (`trouverPays` accepte nom ou code) ; inconnu → placeholder, et non envoyé s'il n'est pas touché.
    pays: trouverPays(u?.pays)?.nom ?? '',
    statut: u?.statut === 'suspendu' ? 'suspendu' : 'actif',
  }
}

export interface ProprietesUtilisateurModal {
  ouvert: boolean
  /** Compte à modifier ; `null` = création. */
  utilisateur: Utilisateur | null
  onFermer: () => void
  /** Appelé après succès de l'API : la page ferme la modale, affiche le toast et invalide la liste. */
  onEnregistre: (utilisateur: Utilisateur, mode: ModeUtilisateurModal) => void
}

/**
 * Création / édition d'un compte joueur par l'administrateur (`POST` / `PATCH /api/utilisateurs`).
 * En édition, seuls les champs modifiés sont envoyés ; les erreurs de validation de l'API (`details`)
 * sont reportées champ par champ.
 */
export function UtilisateurModal({ ouvert, utilisateur, onFermer, onEnregistre }: ProprietesUtilisateurModal) {
  const edition = utilisateur !== null
  const creer = useServerFn(creerUtilisateur)
  const modifier = useServerFn(modifierUtilisateur)
  const schema = useMemo(() => construireSchema(edition), [edition])
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursInitiales(utilisateur) })
  const champPays = register('pays')

  // Réinitialise le formulaire à chaque ouverture (création vide ou compte prérempli).
  useEffect(() => {
    if (ouvert) reset(valeursInitiales(utilisateur))
  }, [ouvert, utilisateur, reset])

  /** Au choix du pays, préremplit l'indicatif si le numéro est vide (ou n'est qu'un indicatif précédent). */
  const surChangementPays = (e: ChangeEvent<HTMLSelectElement>) => {
    void champPays.onChange(e)
    const indicatif = indicatifPays(e.target.value)
    const actuel = (getValues('telephone') ?? '').trim()
    if (indicatif && (actuel === '' || INDICATIF_SEUL.test(actuel))) setValue('telephone', `${indicatif} `, { shouldDirty: true })
  }

  const soumettre = handleSubmit(async (v) => {
    const telephone = nettoyerTelephone(v.telephone)
    if (utilisateur) {
      const patch: ModificationUtilisateurAdmin = {}
      if (dirtyFields.nomUtilisateur) patch.nomUtilisateur = v.nomUtilisateur
      if (dirtyFields.email) patch.email = v.email
      if (dirtyFields.telephone) patch.telephone = telephone
      if (dirtyFields.pays) patch.pays = v.pays ?? ''
      if (dirtyFields.statut) patch.statut = v.statut
      if (v.motDePasse) patch.motDePasse = v.motDePasse
      const r = await modifier({ data: { id: utilisateur.id, ...patch } })
      if (!r.ok) {
        toastErreur('Modification impossible', appliquerErreursApi(r, setError))
        return
      }
      onEnregistre(r.donnees, 'edition')
      return
    }
    const r = await creer({
      data: {
        nomUtilisateur: v.nomUtilisateur,
        email: v.email,
        motDePasse: v.motDePasse ?? '',
        telephone: telephone || undefined,
        pays: v.pays || undefined,
        statut: v.statut,
      },
    })
    if (!r.ok) {
      toastErreur('Création impossible', appliquerErreursApi(r, setError))
      return
    }
    onEnregistre(r.donnees, 'creation')
  })

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre={utilisateur ? 'Modifier le compte' : 'Nouvel utilisateur'}
      description={utilisateur ? `${utilisateur.nomUtilisateur} · ${utilisateur.email}` : 'Le joueur pourra se connecter immédiatement avec ce mot de passe.'}
      verrouille={isSubmitting}
    >
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Input label="Pseudo" autoComplete="off" iconeDebut={icone.profil} placeholder="kader225" {...register('nomUtilisateur')} erreur={errors.nomUtilisateur?.message} />
        <Input label="E-mail" type="email" autoComplete="off" iconeDebut={icone.courriel} placeholder="joueur@exemple.com" {...register('email')} erreur={errors.email?.message} />
        <InputMotDePasse
          label={edition ? 'Nouveau mot de passe' : 'Mot de passe'}
          autoComplete="new-password"
          {...register('motDePasse')}
          erreur={errors.motDePasse?.message}
          aide={edition ? 'Laisser vide pour ne pas le changer.' : `${MOT_DE_PASSE_MIN} caractères minimum.`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Pays" groupes={GROUPES_PAYS} placeholder="Choisissez un pays" autoComplete="off" {...champPays} onChange={surChangementPays} erreur={errors.pays?.message} />
          <Input
            label="Téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            iconeDebut={icone.telephone}
            placeholder="+225 07 00 00 00 00"
            {...register('telephone')}
            erreur={errors.telephone?.message}
          />
        </div>
        <Select label="Statut" options={OPTIONS_STATUT} {...register('statut')} erreur={errors.statut?.message} aide="Un compte suspendu ne peut pas se connecter." />
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button variante="fantome" onClick={onFermer} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            variante={edition ? 'primaire' : 'volt'}
            chargement={isSubmitting}
            disabled={edition && !isDirty}
            iconeDebut={edition ? icone.valider : icone.ajouterUtilisateur}
          >
            {edition ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

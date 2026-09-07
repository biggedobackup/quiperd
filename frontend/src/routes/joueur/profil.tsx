import { useState, type ChangeEvent } from 'react'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { cles } from '@/lib/query'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { formatDate } from '@/lib/format'
import { indicatifPays, optionsPaysGroupees, trouverPays } from '@/lib/pays'
import { optionsComptesGamers, optionsJeux, optionsPlateformes } from '@/lib/requetes'
import { changerMotDePasse } from '@/services/auth'
import { modifierProfil } from '@/services/utilisateurs'
import { creerCompteGamer, supprimerCompteGamer } from '@/services/comptes-gamers'
import type { CompteGamer } from '@/models/compte-gamer'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Select } from '@/components/partages/select/select'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/profil')({
  head: () => ({ meta: [{ title: 'Profil — QUI PERD' }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      // Attendu, non préchargé : la section des identifiants de jeu clignotait sinon.
      context.queryClient.ensureQueryData(optionsComptesGamers),
    ])
  },
  component: PageProfil,
})

function PageProfil() {
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  return (
    <>
      <EnTetePage surtitre="Compte" titre={moi.nomUtilisateur} description={`Membre depuis le ${formatDate(moi.dateCreation)} · ${moi.email}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormulaireProfil />
        <FormulaireMotDePasse />
      </div>
      <ComptesGamers />
    </>
  )
}

/* ------------------------------------------------------------------ Profil */
const GROUPES_PAYS = optionsPaysGroupees()
/** Indicatif seul (issu du préremplissage) : équivaut à « pas de numéro ». */
const INDICATIF_SEUL = /^\+\d{1,4}$/
/** Format international permissif : « + » facultatif puis 7 à 20 chiffres, espaces, points ou tirets. */
const TELEPHONE_VALIDE = /^\+?\d[\d\s.-]{6,19}$/

/** Numéro nettoyé, ou `undefined` s'il est vide ou réduit à l'indicatif (le PATCH backend ignore les champs vides). */
function nettoyerTelephone(valeur: string | undefined): string | undefined {
  const t = (valeur ?? '').trim()
  return t === '' || INDICATIF_SEUL.test(t) ? undefined : t
}

const schemaProfil = z.object({
  nomUtilisateur: z.string().min(3, MESSAGES.pseudo).max(50, MESSAGES.pseudo),
  telephone: z
    .string()
    .optional()
    .refine((v) => {
      const t = nettoyerTelephone(v)
      return t === undefined || TELEPHONE_VALIDE.test(t)
    }, 'Numéro invalide (format international, ex. +225 07 00 00 00 00)'),
  pays: z.string().optional(),
  photoProfil: z.string().optional(),
})
type ValeursProfil = z.infer<typeof schemaProfil>

function FormulaireProfil() {
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const modifier = useServerFn(modifierProfil)
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ValeursProfil>({
    resolver: zodResolver(schemaProfil),
    // Pays ramené à la liste (`trouverPays` accepte nom ou code ISO) ; une valeur inconnue affiche le placeholder
    // sans être écrasée, puisque le backend ignore les chaînes vides.
    defaultValues: { nomUtilisateur: moi.nomUtilisateur, telephone: moi.telephone, pays: trouverPays(moi.pays)?.nom ?? '', photoProfil: moi.photoProfil },
  })
  const champPays = register('pays')

  /** Au choix du pays, préremplit l'indicatif si le numéro est vide (ou n'est qu'un indicatif précédent). */
  const surChangementPays = (e: ChangeEvent<HTMLSelectElement>) => {
    void champPays.onChange(e)
    const indicatif = indicatifPays(e.target.value)
    const actuel = (getValues('telephone') ?? '').trim()
    if (indicatif && (actuel === '' || INDICATIF_SEUL.test(actuel))) setValue('telephone', `${indicatif} `, { shouldDirty: true })
  }

  const soumettre = handleSubmit(async (v) => {
    const r = await modifier({ data: { id: moi.id, ...v, telephone: nettoyerTelephone(v.telephone) } })
    if (!r.ok) {
      toastErreur('Profil non modifié', appliquerErreursApi(r, setError))
      return
    }
    toastSucces('Profil mis à jour')
    await router.invalidate()
  })
  return (
    <form onSubmit={soumettre} className="ticket-sm space-y-4 border-2 border-encre bg-papier p-5" noValidate>
      <h3 className="text-h3">Profil</h3>
      <Input label="Pseudo" {...register('nomUtilisateur')} erreur={errors.nomUtilisateur?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Pays" groupes={GROUPES_PAYS} placeholder="Choisissez votre pays" autoComplete="country-name" {...champPays} onChange={surChangementPays} erreur={errors.pays?.message} />
        <Input
          label="Téléphone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+225 07 00 00 00 00"
          {...register('telephone')}
          erreur={errors.telephone?.message}
          aide="Format international. Sert uniquement à vous joindre."
        />
      </div>
      <Input label="Photo de profil (URL)" type="url" placeholder="https://…" {...register('photoProfil')} erreur={errors.photoProfil?.message} />
      <div className="flex justify-end">
        <Button type="submit" chargement={isSubmitting} disabled={!isDirty} iconeDebut={icone.valider}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ Mot de passe */
const schemaMdp = z
  .object({
    motDePasseActuel: z.string().min(1, MESSAGES.requis),
    nouveauMotDePasse: z.string().min(6, MESSAGES.motDePasse),
    confirmation: z.string(),
  })
  .refine((v) => v.nouveauMotDePasse === v.confirmation, { path: ['confirmation'], message: 'Les mots de passe ne correspondent pas' })
type ValeursMdp = z.infer<typeof schemaMdp>

function FormulaireMotDePasse() {
  const changer = useServerFn(changerMotDePasse)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ValeursMdp>({ resolver: zodResolver(schemaMdp) })
  const soumettre = handleSubmit(async (v) => {
    const r = await changer({ data: { motDePasseActuel: v.motDePasseActuel, nouveauMotDePasse: v.nouveauMotDePasse, role: 'joueur' } })
    if (!r.ok) {
      toastErreur('Mot de passe non modifié', appliquerErreursApi(r, setError))
      if (r.statut === 401) setError('motDePasseActuel', { message: r.message })
      return
    }
    toastSucces('Mot de passe modifié')
    reset()
  })
  return (
    <form onSubmit={soumettre} className="ticket-sm space-y-4 border-2 border-encre bg-papier p-5" noValidate>
      <h3 className="text-h3">Mot de passe</h3>
      <InputMotDePasse label="Mot de passe actuel" {...register('motDePasseActuel')} erreur={errors.motDePasseActuel?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputMotDePasse label="Nouveau" autoComplete="new-password" {...register('nouveauMotDePasse')} erreur={errors.nouveauMotDePasse?.message} />
        <InputMotDePasse label="Confirmation" autoComplete="new-password" {...register('confirmation')} erreur={errors.confirmation?.message} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variante="secondaire" chargement={isSubmitting} iconeDebut={icone.cle}>
          Changer
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ Comptes gamers */
const schemaCompte = z.object({
  jeuId: z.string().min(1, MESSAGES.requis),
  plateformeId: z.string().min(1, MESSAGES.requis),
  identifiantJoueur: z.string().min(1, MESSAGES.requis).max(150),
  nomAffichage: z.string().max(150).optional(),
})
type ValeursCompte = z.infer<typeof schemaCompte>

function ComptesGamers() {
  const { data: jeux } = useSuspenseQuery(optionsJeux())
  const { data: plateformes } = useSuspenseQuery(optionsPlateformes())
  const comptes = useQuery(optionsComptesGamers)
  const queryClient = useQueryClient()
  const creer = useServerFn(creerCompteGamer)
  const supprimer = useServerFn(supprimerCompteGamer)
  const [aSupprimer, setASupprimer] = useState<CompteGamer | null>(null)
  const nomJeu = (id: string) => jeux.find((j) => j.id === id)?.nom ?? 'Jeu'
  const nomPlateforme = (id: string) => plateformes.find((p) => p.id === id)?.nom ?? 'Plateforme'

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ValeursCompte>({ resolver: zodResolver(schemaCompte), defaultValues: { jeuId: jeux[0]?.id ?? '', plateformeId: plateformes[0]?.id ?? '' } })

  const ajouter = handleSubmit(async (v) => {
    const r = await creer({ data: v })
    if (!r.ok) {
      toastErreur('Ajout impossible', appliquerErreursApi(r, setError))
      return
    }
    toastSucces('Identifiant ajouté')
    reset({ jeuId: v.jeuId, plateformeId: v.plateformeId, identifiantJoueur: '', nomAffichage: '' })
    void queryClient.invalidateQueries({ queryKey: cles.comptesGamers })
  })

  const mutSupprimer = useMutation({
    mutationFn: (id: string) => supprimer({ data: { id } }),
    onSuccess: (r) => {
      setASupprimer(null)
      if (!r.ok) {
        toastErreur('Suppression impossible', r.message)
        return
      }
      toastSucces('Identifiant supprimé')
      void queryClient.invalidateQueries({ queryKey: cles.comptesGamers })
    },
  })

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h3 className="text-h3">Mes identifiants de joueur</h3>
        <p className="text-legende text-muet">Votre pseudo dans chaque jeu, pour que l’adversaire vous trouve en ligne.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {comptes.isPending ? (
            <SkeletonLignes lignes={2} colonnes={3} />
          ) : comptes.data && comptes.data.length > 0 ? (
            <ul className="divide-y-2 divide-trait border-2 border-encre bg-papier">
              {comptes.data.map((c) => (
                <li key={c.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center border-2 border-encre bg-gris">
                    <FontAwesomeIcon icon={iconePlateforme(nomPlateforme(c.plateformeId))} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="chiffres truncate font-bold">{c.identifiantJoueur}</p>
                    <p className="text-[12px] text-muet">
                      {nomJeu(c.jeuId)} · {nomPlateforme(c.plateformeId)}
                      {c.nomAffichage && ` · ${c.nomAffichage}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setASupprimer(c)} className="flex size-9 items-center justify-center border-2 border-transparent text-perte hover:border-perte" aria-label="Supprimer">
                    <FontAwesomeIcon icon={icone.fermer} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icone={icone.jeu} titre="Aucun identifiant" description="Ajoutez votre pseudo en jeu pour chaque jeu et plateforme sur lesquels vous jouez." />
          )}
        </div>
        <form onSubmit={ajouter} className="ticket-sm h-fit space-y-4 border-2 border-encre bg-papier p-5" noValidate>
          <h4 className="etiquette text-muet">Ajouter</h4>
          <Select label="Jeu" options={jeux.map((j) => ({ valeur: j.id, libelle: j.nom }))} {...register('jeuId')} erreur={errors.jeuId?.message} />
          <Select label="Plateforme" options={plateformes.map((p) => ({ valeur: p.id, libelle: p.nom }))} {...register('plateformeId')} erreur={errors.plateformeId?.message} />
          <Input label="Identifiant en jeu" placeholder="Kader225_PSN" {...register('identifiantJoueur')} erreur={errors.identifiantJoueur?.message} />
          <Input label="Nom affiché (optionnel)" {...register('nomAffichage')} erreur={errors.nomAffichage?.message} />
          <Button type="submit" bloc chargement={isSubmitting} iconeDebut={icone.ajouter}>
            Ajouter
          </Button>
        </form>
      </div>
      <ConfirmModal ouvert={aSupprimer !== null} onFermer={() => setASupprimer(null)} onConfirmer={() => aSupprimer && mutSupprimer.mutate(aSupprimer.id)} titre="Supprimer cet identifiant ?" variante="danger" libelleConfirmer="Supprimer" chargement={mutSupprimer.isPending}>
        <p>
          <strong className="chiffres">{aSupprimer?.identifiantJoueur}</strong> ne sera plus associé à votre compte.
        </p>
      </ConfirmModal>
    </section>
  )
}

import { useState, type ChangeEvent } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { gardeInvite } from '@/server/gardes'
import { inscription } from '@/services/auth'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { icone } from '@/lib/icones'
import { indicatifPays, optionsPaysGroupees } from '@/lib/pays'
import { CadreAuth } from '@/components/public/cadre-auth'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Select } from '@/components/partages/select/select'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const GROUPES_PAYS = optionsPaysGroupees()
/** Indicatif seul (issu du préremplissage) : équivaut à « pas de numéro ». */
const INDICATIF_SEUL = /^\+\d{1,4}$/
/** Format international permissif : « + » facultatif puis 7 à 20 chiffres, espaces, points ou tirets. */
const TELEPHONE_VALIDE = /^\+?\d[\d\s.-]{6,19}$/

/** Numéro nettoyé, ou `undefined` s'il est vide ou réduit à l'indicatif (champ facultatif côté backend). */
function nettoyerTelephone(valeur: string | undefined): string | undefined {
  const t = (valeur ?? '').trim()
  return t === '' || INDICATIF_SEUL.test(t) ? undefined : t
}

const schema = z
  .object({
    nomUtilisateur: z.string().min(3, MESSAGES.pseudo).max(50, MESSAGES.pseudo),
    email: z.email(MESSAGES.email),
    motDePasse: z.string().min(6, MESSAGES.motDePasse),
    confirmation: z.string(),
    // Côté Go (`auth.entreeInscription`), ni `telephone` ni `pays` ne sont `required` : le numéro reste
    // facultatif (format vérifié seulement s'il est saisi) ; le pays est exigé ici pour fiabiliser le profil.
    telephone: z
      .string()
      .optional()
      .refine((v) => {
        const t = nettoyerTelephone(v)
        return t === undefined || TELEPHONE_VALIDE.test(t)
      }, 'Numéro invalide (format international, ex. +225 07 00 00 00 00)'),
    pays: z.string().min(1, MESSAGES.requis),
    majeur: z.boolean().refine((v) => v, 'Vous devez être majeur pour vous inscrire'),
  })
  .refine((v) => v.motDePasse === v.confirmation, { path: ['confirmation'], message: 'Les mots de passe ne correspondent pas' })
type Valeurs = z.infer<typeof schema>

export const Route = createFileRoute('/_public/inscription')({
  head: () => ({ meta: [{ title: 'Créer un compte — QUI PERD' }, { name: 'description', content: 'Créez votre compte QUI PERD pour lancer votre premier défi.' }] }),
  beforeLoad: () => gardeInvite(),
  component: PageInscription,
})

function PageInscription() {
  const inscrire = useServerFn(inscription)
  const navigate = useNavigate()
  const router = useRouter()
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { majeur: false, telephone: '', pays: '' } })
  const champPays = register('pays')

  /** Au choix du pays, préremplit l'indicatif si le numéro est vide (ou n'est qu'un indicatif précédent). */
  const surChangementPays = (e: ChangeEvent<HTMLSelectElement>) => {
    void champPays.onChange(e)
    const indicatif = indicatifPays(e.target.value)
    const actuel = (getValues('telephone') ?? '').trim()
    if (indicatif && (actuel === '' || INDICATIF_SEUL.test(actuel))) setValue('telephone', `${indicatif} `, { shouldDirty: true })
  }

  const soumettre = handleSubmit(async (v) => {
    setErreurGlobale(null)
    const r = await inscrire({ data: { nomUtilisateur: v.nomUtilisateur, email: v.email, motDePasse: v.motDePasse, telephone: nettoyerTelephone(v.telephone), pays: v.pays } })
    if (!r.ok) {
      setErreurGlobale(appliquerErreursApi(r, setError))
      toastErreur('Inscription impossible', r.message)
      return
    }
    toastSucces('Compte créé', 'Un code à 6 chiffres vient de partir vers votre boîte mail.')
    await router.invalidate()
    // Le compte existe et le joueur est connecté : on l'emmène confirmer son adresse, mais
    // l'écran laisse sortir (barre de navigation + « Plus tard »). `nouveau` lui évite de
    // redemander un code dans la minute qui suit celui de l'inscription.
    await navigate({ to: '/joueur/confirmation-email', search: { nouveau: true } })
  })

  return (
    <CadreAuth
      titre="Créer un compte"
      sousTitre="Gratuit. Vous déposez seulement quand vous voulez miser."
      accroche="Votre premier défi vous attend."
      pied={
        <>
          Déjà inscrit ?{' '}
          <Link to="/connexion" className="inline-flex min-h-11 items-center font-semibold text-encre underline decoration-2 underline-offset-4 hover:decoration-volt">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Input label="Pseudo QUI PERD" autoComplete="username" iconeDebut={icone.profil} placeholder="kader225" {...register('nomUtilisateur')} erreur={errors.nomUtilisateur?.message} />
        <Input label="E-mail" type="email" autoComplete="email" iconeDebut={icone.courriel} placeholder="vous@exemple.com" {...register('email')} erreur={errors.email?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputMotDePasse label="Mot de passe" autoComplete="new-password" {...register('motDePasse')} erreur={errors.motDePasse?.message} aide="6 caractères minimum" />
          <InputMotDePasse label="Confirmation" autoComplete="new-password" {...register('confirmation')} erreur={errors.confirmation?.message} />
        </div>
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
            aide="Facultatif, format international. Sert uniquement à vous joindre."
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 border-2 border-trait bg-gris p-3 text-legende has-checked:border-encre">
          <input type="checkbox" className="mt-0.5 size-4 accent-encre" {...register('majeur')} />
          <span>
            Je certifie être majeur et j’accepte les{' '}
            <Link to="/cgu" className="font-semibold underline decoration-2 underline-offset-2">
              conditions générales
            </Link>
            .
          </span>
        </label>
        {errors.majeur && (
          <p className="text-legende font-semibold text-perte" role="alert">
            {errors.majeur.message}
          </p>
        )}
        {erreurGlobale && (
          <p className="border-2 border-perte bg-perte-fond px-3 py-2 text-legende font-semibold text-perte" role="alert">
            {erreurGlobale}
          </p>
        )}
        <Button type="submit" bloc taille="lg" variante="volt" chargement={isSubmitting} iconeFin={icone.suivant}>
          Créer mon compte
        </Button>
      </form>
    </CadreAuth>
  )
}

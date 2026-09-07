import { useState } from 'react'
import { Link, createFileRoute, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { reinitialiserMotDePasse } from '@/services/auth'
import { MESSAGES } from '@/lib/formulaires'
import { icone } from '@/lib/icones'
import { CadreAuth } from '@/components/public/cadre-auth'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const schema = z
  .object({
    token: z.string().min(1, 'Lien de réinitialisation invalide'),
    nouveauMotDePasse: z.string().min(6, MESSAGES.motDePasse),
    confirmation: z.string(),
  })
  .refine((v) => v.nouveauMotDePasse === v.confirmation, { path: ['confirmation'], message: 'Les mots de passe ne correspondent pas' })
type Valeurs = z.infer<typeof schema>

export const Route = createFileRoute('/_public/reinitialisation-mot-de-passe')({
  head: () => ({ meta: [{ title: 'Nouveau mot de passe — QUI PERD' }, { name: 'robots', content: 'noindex' }] }),
  validateSearch: (recherche: Record<string, unknown> & SearchSchemaInput) => ({ token: typeof recherche.token === 'string' ? recherche.token : '' }),
  component: PageReinitialisation,
})

function PageReinitialisation() {
  const { token } = Route.useSearch()
  const reinitialiser = useServerFn(reinitialiserMotDePasse)
  const navigate = useNavigate()
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { token } })

  const soumettre = handleSubmit(async (v) => {
    setErreurGlobale(null)
    const r = await reinitialiser({ data: { token: v.token, nouveauMotDePasse: v.nouveauMotDePasse } })
    if (!r.ok) {
      setErreurGlobale(r.message)
      toastErreur('Réinitialisation impossible', r.message)
      return
    }
    toastSucces('Mot de passe réinitialisé', 'Connectez-vous avec votre nouveau mot de passe.')
    await navigate({ to: '/connexion' })
  })

  return (
    <CadreAuth
      titre="Nouveau mot de passe"
      sousTitre="Choisissez un mot de passe d’au moins 6 caractères."
      pied={
        <Link to="/connexion" className="inline-flex min-h-11 items-center font-semibold text-encre underline decoration-2 underline-offset-4 hover:decoration-vert">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Input label="Jeton de réinitialisation" iconeDebut={icone.cle} {...register('token')} erreur={errors.token?.message} aide="Copié depuis le lien reçu par e-mail." />
        <InputMotDePasse label="Nouveau mot de passe" autoComplete="new-password" {...register('nouveauMotDePasse')} erreur={errors.nouveauMotDePasse?.message} />
        <InputMotDePasse label="Confirmation" autoComplete="new-password" {...register('confirmation')} erreur={errors.confirmation?.message} />
        {erreurGlobale && (
          <p className="rounded-xl border border-perte bg-perte-fond px-3.5 py-2.5 text-legende font-semibold text-perte" role="alert">
            {erreurGlobale}
          </p>
        )}
        <Button type="submit" bloc taille="lg" chargement={isSubmitting} iconeFin={icone.valider}>
          Enregistrer
        </Button>
      </form>
    </CadreAuth>
  )
}

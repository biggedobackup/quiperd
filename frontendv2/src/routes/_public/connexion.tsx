import { useState } from 'react'
import { Link, createFileRoute, useNavigate, useRouter, type SearchSchemaInput } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { gardeInvite } from '@/server/gardes'
import { connexionJoueur } from '@/services/auth'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { icone } from '@/lib/icones'
import { CadreAuth } from '@/components/public/cadre-auth'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const schema = z.object({
  email: z.string().min(1, MESSAGES.requis),
  motDePasse: z.string().min(1, MESSAGES.requis),
})
type Valeurs = z.infer<typeof schema>

export const Route = createFileRoute('/_public/connexion')({
  head: () => ({ meta: [{ title: 'Connexion — QUI PERD' }, { name: 'robots', content: 'noindex' }] }),
  // `vers` : page de l'espace joueur à rouvrir après connexion (ex. un défi vu depuis le site public).
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput): { vers?: string } => ({
    vers: typeof s.vers === 'string' && s.vers.startsWith('/joueur/') ? s.vers : undefined,
  }),
  beforeLoad: () => gardeInvite(),
  component: PageConnexion,
})

function PageConnexion() {
  const connexion = useServerFn(connexionJoueur)
  const navigate = useNavigate()
  const router = useRouter()
  const { vers } = Route.useSearch()
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) })

  const soumettre = handleSubmit(async (valeurs) => {
    setErreurGlobale(null)
    const r = await connexion({ data: valeurs })
    if (!r.ok) {
      setErreurGlobale(appliquerErreursApi(r, setError))
      toastErreur('Connexion refusée', r.message)
      return
    }
    toastSucces(`Bienvenue, ${r.donnees.nomUtilisateur}`)
    await router.invalidate()
    if (vers) {
      await navigate({ href: vers })
    } else {
      await navigate({ to: '/joueur/tableau-de-bord' })
    }
  })

  return (
    <CadreAuth
      titre="Connexion"
      sousTitre="Accédez à vos défis, votre portefeuille et vos matchs."
      pied={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="inline-flex min-h-11 items-center font-semibold text-encre underline decoration-2 underline-offset-4 hover:decoration-vert">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Input label="E-mail ou pseudo" autoComplete="username" iconeDebut={icone.profil} placeholder="kader225" {...register('email')} erreur={errors.email?.message} />
        <InputMotDePasse label="Mot de passe" placeholder="••••••••" {...register('motDePasse')} erreur={errors.motDePasse?.message} />
        {erreurGlobale && (
          <p className="rounded-xl border border-perte bg-perte-fond px-3.5 py-2.5 text-legende font-semibold text-perte" role="alert">
            {erreurGlobale}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <Link to="/mot-de-passe-oublie" className="text-legende text-muet underline decoration-2 underline-offset-4 hover:text-encre">
            Mot de passe oublié ?
          </Link>
        </div>
        <Button type="submit" bloc taille="lg" chargement={isSubmitting} iconeFin={icone.suivant}>
          Se connecter
        </Button>
      </form>
    </CadreAuth>
  )
}

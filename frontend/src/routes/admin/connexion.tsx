import { useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { gardeInviteAdmin } from '@/server/gardes'
import { connexionAdmin } from '@/services/auth'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { icone } from '@/lib/icones'
import { Logo } from '@/components/partages/logo/logo'
import { Input } from '@/components/partages/input/input'
import { InputMotDePasse } from '@/components/partages/input/input-mot-de-passe'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const schema = z.object({ email: z.email(MESSAGES.email), motDePasse: z.string().min(1, MESSAGES.requis) })
type Valeurs = z.infer<typeof schema>

/** Connexion administrateur : table `administrateurs`, route dédiée, jamais liée depuis le site public. */
export const Route = createFileRoute('/admin/connexion')({
  head: () => ({ meta: [{ title: 'Administration — Connexion' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  beforeLoad: () => gardeInviteAdmin(),
  component: ConnexionAdmin,
})

function ConnexionAdmin() {
  const connexion = useServerFn(connexionAdmin)
  const navigate = useNavigate()
  const router = useRouter()
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) })

  const soumettre = handleSubmit(async (v) => {
    setErreurGlobale(null)
    const r = await connexion({ data: v })
    if (!r.ok) {
      setErreurGlobale(appliquerErreursApi(r, setError))
      toastErreur('Connexion refusée', r.message)
      return
    }
    toastSucces(`Bonjour ${r.donnees.nom}`)
    await router.invalidate()
    await navigate({ to: '/admin/tableau-de-bord' })
  })

  return (
    <main className="flex min-h-dvh items-center justify-center bg-craie px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="etiquette rounded-full bg-vert px-2.5 py-1 text-craie">Administration</span>
        </div>
        <form onSubmit={soumettre} className="space-y-4 rounded-2xl border border-trait bg-papier p-6 shadow-carte-forte" noValidate>
          <h1 className="text-h2">Arbitrage & gestion</h1>
          <p className="text-legende text-muet">Accès réservé aux administrateurs QUI PERD.</p>
          <Input label="E-mail" type="email" autoComplete="username" iconeDebut={icone.courriel} {...register('email')} erreur={errors.email?.message} />
          <InputMotDePasse label="Mot de passe" {...register('motDePasse')} erreur={errors.motDePasse?.message} />
          {erreurGlobale && (
            <p className="rounded-xl border border-perte bg-perte-fond px-3.5 py-2.5 text-legende font-semibold text-perte" role="alert">
              {erreurGlobale}
            </p>
          )}
          <Button type="submit" bloc taille="lg" chargement={isSubmitting} iconeFin={icone.suivant}>
            Entrer
          </Button>
          <p className="flex items-center gap-2 text-[11px] text-muet">
            <FontAwesomeIcon icon={icone.securite} /> Chaque action est consignée dans le journal d’audit.
          </p>
        </form>
      </div>
    </main>
  )
}

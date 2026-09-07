import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { gardeInvite } from '@/server/gardes'
import { motDePasseOublie } from '@/services/auth'
import { MESSAGES } from '@/lib/formulaires'
import { icone } from '@/lib/icones'
import { CadreAuth } from '@/components/public/cadre-auth'
import { Input } from '@/components/partages/input/input'
import { Button } from '@/components/partages/button/button'
import { toastErreur } from '@/components/partages/toast/toast'

const schema = z.object({ email: z.email(MESSAGES.email) })
type Valeurs = z.infer<typeof schema>

export const Route = createFileRoute('/_public/mot-de-passe-oublie')({
  head: () => ({ meta: [{ title: 'Mot de passe oublié — Défis en Ligne' }, { name: 'robots', content: 'noindex' }] }),
  beforeLoad: () => gardeInvite(),
  component: PageMotDePasseOublie,
})

function PageMotDePasseOublie() {
  const demander = useServerFn(motDePasseOublie)
  const [message, setMessage] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) })

  const soumettre = handleSubmit(async (v) => {
    const r = await demander({ data: v })
    if (!r.ok) {
      toastErreur('Demande impossible', r.message)
      return
    }
    setMessage(r.donnees.message)
  })

  return (
    <CadreAuth
      titre="Mot de passe oublié"
      sousTitre="Indiquez l’e-mail de votre compte : nous vous envoyons un lien de réinitialisation."
      accroche="On ne perd pas un match pour un mot de passe."
      pied={
        <Link to="/connexion" className="inline-flex min-h-11 items-center font-semibold text-encre underline decoration-2 underline-offset-4 hover:decoration-vert">
          Retour à la connexion
        </Link>
      }
    >
      {message ? (
        <div className="flex items-start gap-3 rounded-xl border border-gain bg-gain-fond p-4 text-legende text-gain">
          <FontAwesomeIcon icon={icone.succes} className="mt-0.5" />
          <p>{message}</p>
        </div>
      ) : (
        <form onSubmit={soumettre} className="space-y-4" noValidate>
          <Input label="E-mail" type="email" autoComplete="email" iconeDebut={icone.courriel} placeholder="vous@exemple.com" {...register('email')} erreur={errors.email?.message} />
          <Button type="submit" bloc taille="lg" chargement={isSubmitting} iconeFin={icone.envoyer}>
            Envoyer le lien
          </Button>
        </form>
      )}
    </CadreAuth>
  )
}

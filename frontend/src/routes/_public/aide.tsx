import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { optionsRegles } from '@/lib/requetes'
import { icone } from '@/lib/icones'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { obtenirSessionJoueur } from '@/server/session-fns'
import { envoyerMessageContact } from '@/services/contact'
import { Conteneur, EnTeteSection } from '@/components/public/sections'
import { FaqAccordion, questionsFrequentes } from '@/components/public/faq-accordion'
import { Apparition, ApparitionAuDefilement } from '@/components/partages/animation/animation'
import { Input } from '@/components/partages/input/input'
import { Textarea } from '@/components/partages/textarea/textarea'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/_public/aide')({
  head: () => ({
    meta: [
      { title: 'Aide & FAQ — QUI PERD' },
      { name: 'description', content: 'Réponses aux questions sur les mises, le séquestre, les preuves, les litiges, les dépôts et retraits Mobile Money, et formulaire pour contacter l’équipe.' },
    ],
  }),
  // Joueur connecté : nom et e-mail préremplis (le backend rattache aussi le message à son compte).
  loader: async () => {
    const session = await obtenirSessionJoueur()
    return { expediteur: session ? { nom: session.utilisateur.nomUtilisateur, email: session.utilisateur.email } : null }
  },
  component: PageAide,
})

/** Mêmes bornes que `POST /api/contact` : nom ≥ 2, e-mail valide, sujet 3..150, message 10..2000. */
const schemaContact = z.object({
  nom: z.string().trim().min(2, '2 caractères minimum'),
  email: z.email(MESSAGES.email),
  sujet: z.string().trim().min(3, '3 caractères minimum').max(150, '150 caractères maximum'),
  message: z.string().trim().min(10, '10 caractères minimum').max(2000, '2 000 caractères maximum'),
})
type ValeursContact = z.infer<typeof schemaContact>

interface Expediteur {
  nom: string
  email: string
}

function PageAide() {
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const { expediteur } = Route.useLoaderData()
  return (
    <Apparition>
      <section className="border-b-2 border-encre bg-nuit text-craie">
        <Conteneur className="py-5 md:py-7">
          <span className="etiquette text-craie">Aide</span>
          <h1 className="mt-1 max-w-4xl text-h3 text-craie sm:text-h2">Tout ce qu’il faut savoir avant de miser.</h1>
        </Conteneur>
      </section>
      <Conteneur className="py-14 md:py-20">
        <EnTeteSection
          numero="01"
          titre="Nous contacter"
          intro="Une question absente de la FAQ, un dépôt non crédité, un doute sur un match ? Écrivez-nous : nous répondons par e-mail."
        />
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_320px]">
          <div id="contact" className="scroll-mt-20">
            <ApparitionAuDefilement>
              <FormulaireContact expediteur={expediteur} />
            </ApparitionAuDefilement>
          </div>
          <aside className="space-y-4">
          <div className="ticket-sm border-2 border-encre bg-nuit p-6 text-craie">
            <span className="etiquette text-volt">Contact</span>
            <h2 className="mt-2 text-h3 text-craie">Une question précise ?</h2>
            <p className="mt-2 text-legende text-craie/70">Écrivez-nous depuis le formulaire ci-dessous ou par courriel : l’équipe répond par e-mail, du lundi au samedi.</p>
            <div className="mt-4 flex flex-col gap-2">
              <a href="#contact" className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-volt bg-volt px-4 py-2.5 font-titre text-[12px] font-bold uppercase tracking-wider text-nuit transition-colors hover:bg-craie">
                <FontAwesomeIcon icon={icone.message} /> Écrire un message
              </a>
              <a href="mailto:support@quiperd.com" className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-craie/40 px-4 py-2.5 font-titre text-[12px] font-bold uppercase tracking-wider text-craie transition-colors hover:border-volt hover:text-volt">
                <FontAwesomeIcon icon={icone.courriel} /> support@quiperd.com
              </a>
            </div>
          </div>
          <div className="border-2 border-encre bg-papier p-6">
            <span className="etiquette text-muet">Litige en cours ?</span>
            <p className="mt-2 text-legende">Depuis votre espace, ouvrez l’écran du match : vos preuves et la décision de l’arbitre s’y affichent.</p>
          </div>
          </aside>
        </div>
      </Conteneur>
      <section className="border-t-2 border-encre bg-craie py-14 md:py-20">
        <Conteneur>
          <EnTeteSection numero="02" titre="Questions fréquentes" />
          <div className="max-w-3xl">
            <FaqAccordion questions={questionsFrequentes(regles)} />
          </div>
        </Conteneur>
      </section>
    </Apparition>
  )
}

/** Formulaire « Nous contacter » → `POST /api/contact` (server function `envoyerMessageContact`). */
function FormulaireContact({ expediteur }: { expediteur: Expediteur | null }) {
  const envoyer = useServerFn(envoyerMessageContact)
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValeursContact>({
    resolver: zodResolver(schemaContact),
    defaultValues: { nom: expediteur?.nom ?? '', email: expediteur?.email ?? '', sujet: '', message: '' },
  })
  const longueur = watch('message').length

  const soumettre = handleSubmit(async (valeurs) => {
    setErreurGlobale(null)
    setConfirmation(null)
    const r = await envoyer({ data: valeurs })
    if (!r.ok) {
      if (r.statut === 429) {
        setErreurGlobale('Trop de messages envoyés depuis votre connexion (5 par heure au maximum). Patientez une heure, ou écrivez-nous directement par e-mail.')
        toastErreur('Envoi refusé', 'Limite de messages atteinte pour l’heure en cours.')
      } else {
        setErreurGlobale(appliquerErreursApi(r, setError))
        toastErreur('Envoi impossible', r.message)
      }
      return
    }
    toastSucces('Message envoyé', 'Nous répondons par e-mail.')
    setConfirmation(valeurs.email)
    reset()
  })

  return (
    <form onSubmit={soumettre} noValidate className="ticket border-2 border-encre bg-papier">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-encre bg-gris px-5 py-3 sm:px-6">
        <span className="etiquette flex items-center gap-2">
          <FontAwesomeIcon icon={icone.message} /> Nouveau message
        </span>
        <span className="etiquette text-muet">Réponse par e-mail</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <Input label="Votre nom" autoComplete="name" placeholder="Ex. Kader" {...register('nom')} erreur={errors.nom?.message} />
        <Input label="Votre e-mail" type="email" autoComplete="email" inputMode="email" placeholder="vous@exemple.com" {...register('email')} erreur={errors.email?.message} />
        <Input className="sm:col-span-2" label="Sujet" placeholder="Ex. dépôt non crédité, question sur un litige" maxLength={150} {...register('sujet')} erreur={errors.sujet?.message} />
        <Textarea
          className="sm:col-span-2"
          label="Message"
          rows={6}
          maxLength={2000}
          placeholder="Décrivez votre demande. Pour un match ou un défi, indiquez sa référence."
          aide={<span className="chiffres">{longueur} / 2000 caractères</span>}
          {...register('message')}
          erreur={errors.message?.message}
        />
        {erreurGlobale && (
          <p className="border-2 border-perte bg-perte-fond px-3 py-2 text-legende font-semibold text-perte sm:col-span-2" role="alert">
            {erreurGlobale}
          </p>
        )}
        {confirmation && !erreurGlobale && (
          <p className="border-2 border-gain bg-gain-fond px-3 py-2 text-legende font-semibold text-gain sm:col-span-2" role="status">
            Message envoyé. Nous vous répondons à {confirmation}.
          </p>
        )}
      </div>
      <div className="perforation mx-5 sm:mx-6" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-legende text-muet">Ne communiquez jamais votre mot de passe : l’équipe ne vous le demandera pas.</p>
        <Button type="submit" taille="lg" iconeFin={icone.envoyer} chargement={isSubmitting} className="w-full sm:w-auto sm:shrink-0">
          Envoyer
        </Button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatMontant, formatPourcentage, versNombre } from '@/lib/format'
import { MESSAGES, appliquerErreursApi } from '@/lib/formulaires'
import { optionsJeuxGroupees, optionsPlateformesGroupees } from '@/lib/catalogue'
import { optionsJeux, optionsPlateformes, optionsPortefeuille, optionsRegles } from '@/lib/requetes'
import { creerDefi } from '@/services/defis'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button, LienBouton } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { Textarea } from '@/components/partages/textarea/textarea'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/joueur/defis/nouveau')({
  head: () => ({ meta: [{ title: 'Nouveau défi — QUI PERD' }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.ensureQueryData(optionsPortefeuille),
    ])
  },
  component: NouveauDefi,
})

const DUREES = [
  { valeur: '6', libelle: '6 heures' },
  { valeur: '12', libelle: '12 heures' },
  { valeur: '24', libelle: '24 heures (défaut)' },
  { valeur: '48', libelle: '48 heures' },
  { valeur: '72', libelle: '72 heures' },
]

function NouveauDefi() {
  const { data: jeux } = useSuspenseQuery(optionsJeux())
  const { data: plateformes } = useSuspenseQuery(optionsPlateformes())
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const { data: portefeuille } = useSuspenseQuery(optionsPortefeuille)
  const creer = useServerFn(creerDefi)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)

  const schema = z.object({
    jeuId: z.string().min(1, MESSAGES.requis),
    plateformeId: z.string().min(1, MESSAGES.requis),
    montantMise: z
      .number({ error: MESSAGES.montant })
      .min(regles.miseMinimale, `Mise minimale : ${formatMontant(regles.miseMinimale)}`)
      .max(regles.miseMaximale, `Mise maximale : ${formatMontant(regles.miseMaximale)}`),
    regles: z.string().max(500, '500 caractères maximum').optional(),
    dureeHeures: z.string(),
  })
  type Valeurs = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    // Jeu et plateforme choisis explicitement (liste groupée par catégorie/famille) : aucun défi créé par erreur sur un mauvais jeu.
    defaultValues: { jeuId: '', plateformeId: '', montantMise: regles.miseMinimale, dureeHeures: '24' },
  })

  const mise = versNombre(watch('montantMise'))
  const disponible = versNombre(portefeuille.soldeDisponible)
  const total = mise * 2
  const gainEstime = total - total * regles.commissionDefi
  const soldeInsuffisant = mise > disponible

  const soumettre = handleSubmit(async (v) => {
    setErreurGlobale(null)
    const r = await creer({
      data: { jeuId: v.jeuId, plateformeId: v.plateformeId, montantMise: v.montantMise, regles: v.regles, dureeHeures: Number(v.dureeHeures) },
    })
    if (!r.ok) {
      setErreurGlobale(appliquerErreursApi(r, setError))
      toastErreur(r.statut === 422 ? 'Solde insuffisant' : 'Création impossible', r.message)
      return
    }
    toastSucces('Défi créé', `${formatMontant(r.donnees.montantMise)} bloqués en séquestre. En attente d’un adversaire.`)
    void queryClient.invalidateQueries({ queryKey: cles.defis.tous })
    void queryClient.invalidateQueries({ queryKey: cles.portefeuille.tous })
    await navigate({ to: '/joueur/defis/$defiId', params: { defiId: r.donnees.id } })
  })

  return (
    <>
      <EnTetePage surtitre="Arène" titre="Nouveau défi" description="Votre mise est bloquée dès la création ; si personne ne rejoint, elle vous est rendue moins la commission de la plateforme." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form onSubmit={soumettre} className="ticket space-y-5 border-2 border-encre bg-papier p-6" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Jeu"
              placeholder="Choisissez un jeu"
              groupes={optionsJeuxGroupees(jeux)}
              {...register('jeuId')}
              erreur={errors.jeuId?.message}
              aide="Classés par catégorie : sport, combat, course, tir…"
            />
            <Select
              label="Plateforme"
              placeholder="Choisissez une plateforme"
              groupes={optionsPlateformesGroupees(plateformes)}
              {...register('plateformeId')}
              erreur={errors.plateformeId?.message}
              aide="PC, consoles ou mobile."
            />
          </div>
          <Input
            label="Mise par joueur"
            type="number"
            inputMode="numeric"
            min={regles.miseMinimale}
            max={regles.miseMaximale}
            step={100}
            suffixe="FCFA"
            className="chiffres"
            {...register('montantMise', { valueAsNumber: true })}
            erreur={errors.montantMise?.message}
            aide={`Entre ${formatMontant(regles.miseMinimale)} et ${formatMontant(regles.miseMaximale)}. Disponible : ${formatMontant(disponible)}.`}
          />
          <div className="flex flex-wrap gap-2">
            {[500, 1000, 2000, 5000, 10000]
              .filter((m) => m >= regles.miseMinimale && m <= regles.miseMaximale)
              .map((m) => (
                <MiseRapide key={m} montant={m} />
              ))}
          </div>
          <Select label="Durée d’ouverture" options={DUREES} {...register('dureeHeures')} aide="Sans adversaire à l’échéance, le défi expire et la mise est rendue, moins la commission." />
          <Textarea label="Règles du match (optionnel)" placeholder="Ex. 2 × 6 min, pas d’équipes légendes, connexion stable exigée." {...register('regles')} erreur={errors.regles?.message} />
          {erreurGlobale && (
            <p className="border-2 border-perte bg-perte-fond px-3 py-2 text-legende font-semibold text-perte" role="alert">
              {erreurGlobale}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t-2 border-trait pt-5">
            <LienBouton to="/joueur/defis" variante="fantome">
              Annuler
            </LienBouton>
            <Button type="submit" variante="volt" chargement={isSubmitting} disabled={soldeInsuffisant} iconeDebut={icone.defi}>
              Créer et bloquer {mise > 0 ? formatMontant(mise) : 'la mise'}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="ticket-sm border-2 border-encre bg-nuit p-5 text-craie">
            <span className="etiquette text-craie/60">Récapitulatif</span>
            <dl className="mt-3 space-y-2 text-legende">
              <Ligne libelle="Votre mise (bloquée)" valeur={formatMontant(mise)} />
              <Ligne libelle="Mise de l’adversaire" valeur={formatMontant(mise)} />
              <Ligne libelle="Total en séquestre" valeur={formatMontant(total)} fort />
              <Ligne libelle={`Commission (${formatPourcentage(regles.commissionDefi)})`} valeur={`− ${formatMontant(total * regles.commissionDefi)}`} />
            </dl>
            <div className="mt-4 border-t border-craie/15 pt-4">
              <span className="etiquette text-craie/60">Gain estimé si vous gagnez</span>
              <p className="chiffres mt-1 text-h1 font-bold text-volt">{formatMontant(gainEstime)}</p>
              <p className="mt-1 text-[11px] text-craie/50">Estimation avec le taux actuel ; le montant réel est calculé par la plateforme au règlement.</p>
            </div>
          </div>
          <div className={`flex items-start gap-3 border-2 p-4 text-legende ${soldeInsuffisant ? 'border-perte bg-perte-fond text-perte' : 'border-trait bg-papier text-muet'}`}>
            <FontAwesomeIcon icon={soldeInsuffisant ? icone.attention : icone.info} className="mt-0.5" />
            {soldeInsuffisant ? (
              <p>
                Solde disponible insuffisant ({formatMontant(disponible)}).{' '}
                <LienBouton to="/joueur/portefeuille" variante="lien" taille="sm" className="h-auto! px-0! text-perte">
                  Déposer des fonds
                </LienBouton>
              </p>
            ) : (
              <p>Après création, il vous restera {formatMontant(disponible - mise)} disponibles.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}

function MiseRapide({ montant }: { montant: number }) {
  return (
    <button
      type="button"
      className="chiffres h-8 border-2 border-trait bg-gris px-3 text-legende font-bold transition-colors hover:border-encre hover:bg-volt hover:text-nuit"
      onClick={(e) => {
        const form = e.currentTarget.closest('form')
        const champ = form?.querySelector<HTMLInputElement>('input[name="montantMise"]')
        if (!champ) return
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(champ, String(montant))
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      }}
    >
      {formatMontant(montant)}
    </button>
  )
}

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={fort ? 'font-bold text-craie' : 'text-craie/70'}>{libelle}</dt>
      <dd className={`chiffres ${fort ? 'font-bold text-craie' : 'text-craie/90'}`}>{valeur}</dd>
    </div>
  )
}

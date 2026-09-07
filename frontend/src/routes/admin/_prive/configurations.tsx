import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant, formatPourcentage, versNombre } from '@/lib/format'
import { libellesConfigurations } from '@/lib/statuts'
import { optionsConfigurations } from '@/lib/requetes'
import { modifierConfiguration } from '@/services/administration'
import type { ConfigurationFinanciere, TypeConfiguration } from '@/models/administration'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Modal } from '@/components/partages/modal/modal'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/admin/_prive/configurations')({
  head: () => ({ meta: [{ title: 'Administration — Configurations financières' }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(optionsConfigurations)
  },
  component: PageConfigurations,
})

const ORDRE: TypeConfiguration[] = ['commission_defi', 'mise_minimale', 'mise_maximale', 'frais_retrait']

function PageConfigurations() {
  const { data } = useSuspenseQuery(optionsConfigurations)
  const [edition, setEdition] = useState<ConfigurationFinanciere | null>(null)
  const configs = ORDRE.map((t) => data.find((c) => c.type === t)).filter((c): c is ConfigurationFinanciere => !!c)

  return (
    <>
      <EnTetePage surtitre="Règles financières" titre="Configurations" description="Chaque modification prend effet immédiatement sur les prochains défis et retraits, et reste historisée dans le journal d’audit." />
      <div className="grid gap-4 md:grid-cols-2">
        {configs.map((c) => {
          const meta = libellesConfigurations[c.type]
          return (
            <div key={c.id}>
              <div className="flex h-full flex-col rounded-2xl border border-trait bg-papier p-5 shadow-carte">
                <span className="etiquette text-muet">{meta?.libelle ?? c.type}</span>
                <p className="chiffres mt-2 text-display-sm font-bold">{meta?.unite === 'pourcentage' ? formatPourcentage(c.valeur) : formatMontant(c.valeur, c.devise)}</p>
                <p className="mt-2 text-legende text-muet">{meta?.aide}</p>
                <div className="mt-auto flex items-center justify-between pt-4 text-[11px] text-muet">
                  <span className="chiffres">en vigueur depuis le {formatDateHeure(c.dateDebut)}</span>
                  <Button taille="sm" variante="secondaire" className="min-h-11" onClick={() => setEdition(c)} iconeDebut={icone.reglages}>
                    Modifier
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {edition && <EditionConfigurationModal configuration={edition} onFermer={() => setEdition(null)} />}
    </>
  )
}

function EditionConfigurationModal({ configuration, onFermer }: { configuration: ConfigurationFinanciere; onFermer: () => void }) {
  const meta = libellesConfigurations[configuration.type]
  const pourcentage = meta?.unite === 'pourcentage'
  const valeurActuelle = versNombre(configuration.valeur)
  const queryClient = useQueryClient()
  const modifier = useServerFn(modifierConfiguration)
  const [confirme, setConfirme] = useState(false)
  const { register, handleSubmit, watch, formState } = useForm<{ valeur: number }>({ defaultValues: { valeur: pourcentage ? Math.round(valeurActuelle * 10000) / 100 : valeurActuelle } })
  const saisie = watch('valeur')
  const nouvelle = pourcentage ? saisie / 100 : saisie

  const mutation = useMutation({
    mutationFn: (valeur: number) => modifier({ data: { type: configuration.type, valeur } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Modification impossible', r.message)
        return
      }
      toastSucces(`${meta?.libelle} mis à jour`, 'Historisé dans le journal d’audit.')
      void queryClient.invalidateQueries({ queryKey: cles.admin.configurations })
      void queryClient.invalidateQueries({ queryKey: cles.regles })
      onFermer()
    },
  })

  return (
    <Modal ouvert onFermer={onFermer} titre={meta?.libelle ?? configuration.type} description={meta?.aide} taille="sm" verrouille={mutation.isPending}>
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(pourcentage ? Math.round(v.valeur * 10000) / 1000000 : v.valeur))}
        className="space-y-4"
        noValidate
      >
        <Input
          label={pourcentage ? 'Nouveau taux' : 'Nouveau montant'}
          type="number"
          step={pourcentage ? 0.1 : 100}
          min={0}
          max={pourcentage ? 100 : undefined}
          suffixe={pourcentage ? '%' : 'FCFA'}
          className="chiffres"
          {...register('valeur', { valueAsNumber: true, required: 'Valeur obligatoire', min: { value: 0, message: 'Valeur positive' }, max: pourcentage ? { value: 100, message: '100 % maximum' } : undefined })}
          erreur={formState.errors.valeur?.message}
        />
        <dl className="grid grid-cols-2 gap-2 rounded-xl border border-trait bg-gris p-3 text-legende">
          <dt className="text-muet">Actuel</dt>
          <dd className="chiffres text-right">{pourcentage ? formatPourcentage(valeurActuelle) : formatMontant(valeurActuelle)}</dd>
          <dt className="text-muet">Nouveau</dt>
          <dd className="chiffres text-right font-bold">{Number.isFinite(nouvelle) ? (pourcentage ? formatPourcentage(nouvelle) : formatMontant(nouvelle)) : '—'}</dd>
        </dl>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-alerte bg-alerte-fond p-3 text-legende text-alerte">
          <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-0.5 accent-alerte" />
          <span>Je comprends l’impact financier immédiat de ce changement.</span>
        </label>
        <div className="flex justify-end gap-3">
          <Button variante="fantome" onClick={onFermer} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" variante="volt" disabled={!confirme || !Number.isFinite(nouvelle)} chargement={mutation.isPending} iconeDebut={icone.valider}>
            Appliquer
          </Button>
        </div>
        <p className="flex items-center gap-2 text-[11px] text-muet">
          <FontAwesomeIcon icon={icone.info} /> L’ancienne valeur est clôturée, jamais écrasée.
        </p>
      </form>
    </Modal>
  )
}

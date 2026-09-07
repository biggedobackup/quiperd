import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { formatMontant } from '@/lib/format'
import { libellesPrestataires } from '@/lib/statuts'
import type { DemandeDepot } from '@/models/paiement'

const schema = z.object({
  montant: z.number({ error: 'Montant invalide' }).min(100, 'Minimum 100 FCFA').max(5_000_000, 'Maximum 5 000 000 FCFA'),
  prestataire: z.enum(['ligdicash', 'fusionmoney']),
  numero: z.string().optional(),
})
type Valeurs = z.infer<typeof schema>

export function DepotModal({ ouvert, onFermer, onDeposer, chargement = false, telephone }: { ouvert: boolean; onFermer: () => void; onDeposer: (d: DemandeDepot) => Promise<void>; chargement?: boolean; telephone?: string }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { montant: 5000, prestataire: 'ligdicash', numero: telephone ?? '' } })
  const montant = watch('montant')
  const prestataire = watch('prestataire')

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Déposer des fonds" description="Paiement Mobile Money sur la page sécurisée du prestataire ; votre solde est crédité dès confirmation." verrouille={chargement}>
      <form id="form-depot" onSubmit={handleSubmit((v) => onDeposer({ montant: v.montant, prestataire: v.prestataire, numero: v.numero || undefined }))} className="space-y-5" noValidate>
        <Input label="Montant" type="number" inputMode="numeric" min={100} step={100} suffixe="FCFA" className="chiffres" {...register('montant', { valueAsNumber: true })} erreur={errors.montant?.message} />
        <Select
          label="Prestataire"
          options={Object.entries(libellesPrestataires).map(([valeur, libelle]) => ({ valeur, libelle }))}
          {...register('prestataire')}
          erreur={errors.prestataire?.message}
        />
        <Input label={`Numéro Mobile Money${prestataire === 'fusionmoney' ? '' : ' (optionnel)'}`} type="tel" placeholder="+225 07 00 00 00 00" {...register('numero')} erreur={errors.numero?.message} aide={prestataire === 'fusionmoney' ? 'Requis par MoneyFusion.' : undefined} />
        <div className="flex justify-end gap-3">
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button type="submit" form="form-depot" variante="volt" chargement={chargement}>
            Déposer {Number.isFinite(montant) && montant > 0 ? formatMontant(montant) : ''}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { formatMontant, formatPourcentage } from '@/lib/format'
import { libellesPrestataires } from '@/lib/statuts'
import type { DemandeRetrait } from '@/models/paiement'

export function RetraitModal({
  ouvert,
  onFermer,
  onRetirer,
  chargement = false,
  disponible,
  fraisRetrait,
  telephone,
}: {
  ouvert: boolean
  onFermer: () => void
  onRetirer: (d: DemandeRetrait) => Promise<void>
  chargement?: boolean
  disponible: number
  fraisRetrait: number
  telephone?: string
}) {
  const schema = z.object({
    montant: z
      .number({ error: 'Montant invalide' })
      .min(500, 'Minimum 500 FCFA')
      .refine((m) => m + m * fraisRetrait <= disponible, 'Montant + frais supérieurs à votre solde disponible'),
    prestataire: z.enum(['ligdicash', 'fusionmoney']),
    numero: z.string().min(8, 'Numéro Mobile Money requis'),
  })
  type Valeurs = z.infer<typeof schema>
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { montant: 1000, prestataire: 'ligdicash', numero: telephone ?? '' } })
  const montant = watch('montant')
  const frais = Number.isFinite(montant) ? Math.round(montant * fraisRetrait * 100) / 100 : 0
  const total = Number.isFinite(montant) ? montant + frais : 0

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Retirer des fonds" description="Le montant et les frais sont débités immédiatement du solde disponible. En cas d’échec du retrait, tout est recrédité." verrouille={chargement}>
      <form id="form-retrait" onSubmit={handleSubmit((v) => onRetirer(v))} className="space-y-5" noValidate>
        <Input label="Montant à recevoir" type="number" inputMode="numeric" min={500} step={100} suffixe="FCFA" className="chiffres" {...register('montant', { valueAsNumber: true })} erreur={errors.montant?.message} aide={`Disponible : ${formatMontant(disponible)}`} />
        <Select label="Prestataire" options={Object.entries(libellesPrestataires).map(([valeur, libelle]) => ({ valeur, libelle }))} {...register('prestataire')} />
        <Input label="Numéro Mobile Money" type="tel" placeholder="+225 07 00 00 00 00" {...register('numero')} erreur={errors.numero?.message} />
        <dl className="space-y-1.5 border-2 border-trait bg-gris p-3 text-legende">
          <div className="flex justify-between">
            <dt className="text-muet">Vous recevez</dt>
            <dd className="chiffres">{formatMontant(Number.isFinite(montant) ? montant : 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muet">Frais de retrait ({formatPourcentage(fraisRetrait)})</dt>
            <dd className="chiffres">{formatMontant(frais)}</dd>
          </div>
          <div className="flex justify-between border-t border-trait pt-1.5 font-bold">
            <dt>Débité du solde</dt>
            <dd className="chiffres">{formatMontant(total)}</dd>
          </div>
          <p className="text-[11px] text-muet">Estimation : les frais exacts sont calculés par la plateforme à la demande.</p>
        </dl>
        <div className="flex justify-end gap-3">
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button type="submit" form="form-retrait" variante="primaire" chargement={chargement}>
            Confirmer le retrait
          </Button>
        </div>
      </form>
    </Modal>
  )
}

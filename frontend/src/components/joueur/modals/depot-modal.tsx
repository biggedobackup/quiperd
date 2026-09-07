import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { formatMontant } from '@/lib/format'
import type { DemandeDepot, Prestataire, PrestatairePublic } from '@/models/paiement'

export function DepotModal({
  ouvert,
  onFermer,
  onDeposer,
  chargement = false,
  telephone,
  prestataires,
}: {
  ouvert: boolean
  onFermer: () => void
  onDeposer: (d: DemandeDepot) => Promise<void>
  chargement?: boolean
  telephone?: string
  /** Moyens de paiement annoncés par le backend — jamais une liste codée en dur ici. */
  prestataires: readonly PrestatairePublic[]
}) {
  const defaut = prestataires[0]?.code
  /** Un seul moyen actif : on l'annonce en clair au lieu d'une liste à un choix. */
  const unique = prestataires.length === 1 ? prestataires[0] : undefined

  // Le schéma dépend de la liste du serveur : le champ « numéro » n'est obligatoire que
  // pour les passerelles qui l'exigent à la création (MoneyFusion), pas pour celles qui
  // le collectent sur leur propre page (LigdiCash).
  const schema = useMemo(
    () =>
      z
        .object({
          montant: z.number({ error: 'Montant invalide' }).int('Montant en francs entiers')
            .min(100, 'Minimum 100 FCFA').max(5_000_000, 'Maximum 5 000 000 FCFA'),
          prestataire: z.string().min(1, 'Choisissez un prestataire'),
          numero: z.string().optional(),
        })
        .superRefine((v, ctx) => {
          const choisi = prestataires.find((p) => p.code === v.prestataire)
          if (!choisi) {
            ctx.addIssue({ code: 'custom', path: ['prestataire'], message: 'Prestataire indisponible' })
            return
          }
          if (choisi.numeroRequis && (v.numero ?? '').trim().length < 8) {
            ctx.addIssue({ code: 'custom', path: ['numero'], message: `Numéro Mobile Money requis par ${choisi.libelle}` })
          }
        }),
    [prestataires],
  )
  type Valeurs = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { montant: 5000, prestataire: defaut ?? '', numero: telephone ?? '' } })
  const montant = watch('montant')
  const choisi = prestataires.find((p) => p.code === watch('prestataire'))

  const aucun = prestataires.length === 0

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Déposer des fonds" description="Paiement Mobile Money sur la page sécurisée du prestataire ; votre solde est crédité dès confirmation." verrouille={chargement}>
      {aucun ? (
        <div className="space-y-5">
          <p className="border-2 border-alerte bg-alerte-fond p-3 text-legende">
            Aucun moyen de paiement n’est disponible pour le moment. Le dépôt rouvrira dès qu’une passerelle Mobile Money sera de nouveau active.
          </p>
          <div className="flex justify-end">
            <Button variante="fantome" onClick={onFermer}>
              Fermer
            </Button>
          </div>
        </div>
      ) : (
        <form
          id="form-depot"
          onSubmit={handleSubmit((v) => onDeposer({ montant: v.montant, prestataire: v.prestataire as Prestataire, numero: v.numero?.trim() || undefined }))}
          className="space-y-5"
          noValidate
        >
          <Input label="Montant" type="number" inputMode="numeric" min={100} step={100} suffixe="FCFA" className="chiffres" {...register('montant', { valueAsNumber: true })} erreur={errors.montant?.message} />
          {unique ? (
            // La valeur reste dans le formulaire, simplement sans champ à remplir.
            <>
              <input type="hidden" {...register('prestataire')} />
              <p className="text-legende text-muet">
                Paiement via <strong className="text-encre">{unique.libelle}</strong>.
              </p>
            </>
          ) : (
            <Select
              label="Prestataire"
              options={prestataires.map((p) => ({ valeur: p.code, libelle: p.libelle }))}
              {...register('prestataire')}
              erreur={errors.prestataire?.message}
            />
          )}
          <Input
            label={`Numéro Mobile Money${choisi?.numeroRequis ? '' : ' (optionnel)'}`}
            type="tel"
            placeholder="+225 07 00 00 00 00"
            {...register('numero')}
            erreur={errors.numero?.message}
            aide={choisi?.numeroRequis ? `Requis par ${choisi.libelle}.` : undefined}
          />
          <div className="flex justify-end gap-3">
            <Button variante="fantome" onClick={onFermer} disabled={chargement}>
              Annuler
            </Button>
            <Button type="submit" form="form-depot" variante="volt" chargement={chargement}>
              Déposer {Number.isFinite(montant) && montant > 0 ? formatMontant(montant) : ''}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

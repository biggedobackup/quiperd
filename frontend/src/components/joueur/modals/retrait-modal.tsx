import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { DemandeRetrait, Prestataire, PrestatairePublic } from '@/models/paiement'

export function RetraitModal({
  ouvert,
  onFermer,
  onRetirer,
  chargement = false,
  retirable,
  nonJoue,
  fraisRetrait,
  telephone,
  prestataires,
}: {
  ouvert: boolean
  onFermer: () => void
  onRetirer: (d: DemandeRetrait) => Promise<void>
  chargement?: boolean
  /** Plafond RÉEL du retrait : `soldeRetirable` du backend, jamais le solde disponible brut. */
  retirable: number
  /** Part du solde venue d'un dépôt jamais misé — sert à expliquer pourquoi le plafond est plus bas. */
  nonJoue: number
  fraisRetrait: number
  telephone?: string
  /** Moyens de paiement annoncés par le backend — jamais une liste codée en dur ici. */
  prestataires: readonly PrestatairePublic[]
}) {
  const defaut = prestataires[0]?.code
  /** Un seul moyen actif : on l'annonce en clair au lieu d'une liste à un choix. */
  const unique = prestataires.length === 1 ? prestataires[0] : undefined
  const schema = useMemo(
    () =>
      z.object({
        montant: z
          .number({ error: 'Montant invalide' })
          .int('Montant en francs entiers')
          .min(500, 'Minimum 500 FCFA')
          // Le plafond est le solde RETIRABLE, pas le solde disponible : un dépôt jamais misé
          // en est exclu. Le backend refuse de toute façon (422), mais l'annoncer ici évite
          // au joueur de remplir un formulaire pour rien.
          .refine((m) => m + m * fraisRetrait <= retirable, 'Montant + frais supérieurs à votre solde retirable'),
        // Le retrait exige toujours un numéro, quel que soit le prestataire : c'est la
        // destination du transfert, pas un moyen d'authentifier un paiement.
        prestataire: z.string().refine((c) => prestataires.some((p) => p.code === c), 'Prestataire indisponible'),
        numero: z.string().min(8, 'Numéro Mobile Money requis'),
      }),
    [retirable, fraisRetrait, prestataires],
  )
  type Valeurs = z.infer<typeof schema>
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { montant: 1000, prestataire: defaut ?? '', numero: telephone ?? '' } })
  const montant = watch('montant')
  const frais = Number.isFinite(montant) ? Math.round(montant * fraisRetrait * 100) / 100 : 0
  const total = Number.isFinite(montant) ? montant + frais : 0

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Retirer des fonds" description="Le montant et les frais sont débités immédiatement du solde disponible. En cas d’échec du retrait, tout est recrédité." verrouille={chargement}>
      {prestataires.length === 0 ? (
        <div className="space-y-5">
          <p className="rounded-xl border border-alerte bg-alerte-fond p-3 text-legende">
            Aucun moyen de paiement n’est disponible pour le moment. Votre solde reste intact : le retrait rouvrira dès qu’une passerelle Mobile Money sera de nouveau active.
          </p>
          <div className="flex justify-end">
            <Button variante="fantome" onClick={onFermer}>
              Fermer
            </Button>
          </div>
        </div>
      ) : (
        <form id="form-retrait" onSubmit={handleSubmit((v) => onRetirer({ montant: v.montant, prestataire: v.prestataire as Prestataire, numero: v.numero.trim() }))} className="space-y-5" noValidate>
          {/*
            Sans cette phrase, un joueur qui voit « 5 000 FCFA » sur son portefeuille et ne peut
            rien retirer croit à une panne. On dit le montant concerné et la façon d'y remédier :
            miser, ce qui est exactement l'objet de la plateforme.
          */}
          {nonJoue > 0 && (
            <p className="rounded-xl border border-alerte bg-alerte-fond p-3 text-legende">
              <strong className="text-encre">{formatMontant(nonJoue)}</strong> de votre solde vient d’un dépôt qui n’a pas encore été misé. Un dépôt se joue avant de pouvoir être retiré : lancez ou rejoignez un défi et ce montant redeviendra retirable.
            </p>
          )}
          <Input label="Montant à recevoir" type="number" inputMode="numeric" min={500} step={100} suffixe="FCFA" className="chiffres" {...register('montant', { valueAsNumber: true })} erreur={errors.montant?.message} aide={`Retirable : ${formatMontant(retirable)}`} />
          {unique ? (
            <>
              <input type="hidden" {...register('prestataire')} />
              <p className="text-legende text-muet">
                Transfert via <strong className="text-encre">{unique.libelle}</strong>.
              </p>
            </>
          ) : (
            <Select label="Prestataire" options={prestataires.map((p) => ({ valeur: p.code, libelle: p.libelle }))} {...register('prestataire')} erreur={errors.prestataire?.message} />
          )}
          <Input label="Numéro Mobile Money" type="tel" placeholder="+225 07 00 00 00 00" {...register('numero')} erreur={errors.numero?.message} />
          <dl className="space-y-1.5 rounded-xl border border-trait bg-gris p-3 text-legende">
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
      )}
    </Modal>
  )
}

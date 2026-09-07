import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Textarea } from '@/components/partages/textarea/textarea'
import type { Declaration } from '@/models/match'

const schema = z.object({
  scorePour: z.number({ error: 'Score invalide' }).int().min(0, 'Minimum 0').max(99, 'Maximum 99'),
  scoreContre: z.number({ error: 'Score invalide' }).int().min(0, 'Minimum 0').max(99, 'Maximum 99'),
  commentaire: z.string().max(300, '300 caractères maximum').optional(),
})
type Valeurs = z.infer<typeof schema>

export interface ProprietesDeclarationScoreModal {
  ouvert: boolean
  onFermer: () => void
  onDeclarer: (d: Declaration) => Promise<void>
  moi: string
  adversaire: string
  chargement?: boolean
  /** Manche en cours : affichée dès qu'il y a eu un rejeu. */
  manche?: number
  /**
   * Scores de départ du formulaire. Quand l'adversaire a déjà déclaré, on préremplit avec sa
   * proposition retournée de mon point de vue : il n'y a qu'un chiffre à corriger pour
   * proposer autre chose (et redéclarer le même score équivaut à confirmer).
   */
  valeursInitiales?: { scorePour: number; scoreContre: number }
  /** L'adversaire a déjà déclaré : le vocabulaire change (« proposer » plutôt que « déclarer »). */
  contreProposition?: boolean
}

/** Déclaration du score « de votre point de vue » : votre score, puis celui de l'adversaire. */
export function DeclarationScoreModal({
  ouvert,
  onFermer,
  onDeclarer,
  moi,
  adversaire,
  chargement = false,
  manche = 1,
  valeursInitiales,
  contreProposition = false,
}: ProprietesDeclarationScoreModal) {
  const pourInitial = valeursInitiales?.scorePour ?? 0
  const contreInitial = valeursInitiales?.scoreContre ?? 0
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: { scorePour: pourInitial, scoreContre: contreInitial },
  })

  // Réinitialisation à chaque ouverture : le formulaire ne garde jamais la saisie d'une
  // manche précédente, et il reprend la proposition adverse quand elle arrive en direct.
  useEffect(() => {
    if (ouvert) reset({ scorePour: pourInitial, scoreContre: contreInitial, commentaire: '' })
  }, [ouvert, pourInitial, contreInitial, reset])

  const pour = watch('scorePour')
  const contre = watch('scoreContre')
  const issue =
    pour > contre
      ? 'Vous déclarez avoir gagné.'
      : pour < contre
        ? 'Vous déclarez avoir perdu.'
        : 'Égalité déclarée : si votre adversaire déclare aussi un nul, vous choisirez chacun de rejouer la manche ou de partager les mises.'

  const description = contreProposition
    ? 'Votre adversaire a déjà déclaré. Si vous inscrivez le même résultat que lui, le match est réglé sur-le-champ ; sinon une preuve sera exigée des deux côtés.'
    : 'Une seule déclaration par joueur et par manche, définitive. Si votre adversaire déclare le même résultat, le match est réglé immédiatement — sans preuve ni arbitre.'

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre={contreProposition ? 'Proposer un autre score' : manche > 1 ? `Déclarer le score — manche ${manche}` : 'Déclarer le score'}
      description={description}
      verrouille={chargement}
    >
      <form
        id="form-declaration"
        onSubmit={handleSubmit((v) => onDeclarer({ scorePour: v.scorePour, scoreContre: v.scoreContre, commentaire: v.commentaire }))}
        className="space-y-5"
        noValidate
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <Input label={`${moi} (vous)`} type="number" inputMode="numeric" min={0} max={99} className="chiffres" {...register('scorePour', { valueAsNumber: true })} erreur={errors.scorePour?.message} />
          <span className="chiffres pb-3 text-h2 text-muet">—</span>
          <Input label={adversaire} type="number" inputMode="numeric" min={0} max={99} className="chiffres" {...register('scoreContre', { valueAsNumber: true })} erreur={errors.scoreContre?.message} />
        </div>
        <p className={`rounded-xl border px-3 py-2 text-legende font-semibold ${pour === contre ? 'border-alerte bg-alerte-fond text-alerte' : 'border-trait bg-gris text-encre'}`}>{issue}</p>
        <Textarea label="Commentaire (optionnel)" placeholder="Ex. adversaire déconnecté à la 80e minute." rows={3} {...register('commentaire')} erreur={errors.commentaire?.message} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variante="fantome" bloc className="sm:w-auto" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button type="submit" form="form-declaration" variante="volt" taille="lg" bloc className="sm:w-auto" chargement={chargement}>
            {contreProposition ? 'Proposer' : 'Déclarer'} {pour} — {contre}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

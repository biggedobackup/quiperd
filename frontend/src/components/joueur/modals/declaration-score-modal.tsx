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
}

/** Déclaration du score « de votre point de vue » : votre score, puis celui de l'adversaire. */
export function DeclarationScoreModal({ ouvert, onFermer, onDeclarer, moi, adversaire, chargement = false }: ProprietesDeclarationScoreModal) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: { scorePour: 0, scoreContre: 0 } })
  const pour = watch('scorePour')
  const contre = watch('scoreContre')
  const issue = pour > contre ? 'Vous déclarez avoir gagné.' : pour < contre ? 'Vous déclarez avoir perdu.' : 'Match nul déclaré : le match passera en litige.'

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Déclarer le score" description="Une seule déclaration par joueur, définitive. Soyez exact : une divergence avec l’adversaire ouvre un litige." verrouille={chargement}>
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
        <p className={`border-2 px-3 py-2 text-legende font-semibold ${pour === contre ? 'border-alerte bg-alerte-fond text-alerte' : 'border-trait bg-gris text-encre'}`}>{issue}</p>
        <Textarea label="Commentaire (optionnel)" placeholder="Ex. adversaire déconnecté à la 80e minute." rows={3} {...register('commentaire')} erreur={errors.commentaire?.message} />
        <div className="flex justify-end gap-3">
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button type="submit" form="form-declaration" variante="volt" chargement={chargement}>
            Déclarer {pour} — {contre}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

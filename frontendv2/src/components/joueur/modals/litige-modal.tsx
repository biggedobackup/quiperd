import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { Textarea } from '@/components/partages/textarea/textarea'

const schema = z.object({ motif: z.string().min(10, 'Décrivez le problème en 10 caractères au moins').max(500, '500 caractères maximum') })
type Valeurs = z.infer<typeof schema>

export function LitigeModal({ ouvert, onFermer, onOuvrir, chargement = false }: { ouvert: boolean; onFermer: () => void; onOuvrir: (motif: string) => Promise<void>; chargement?: boolean }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) })
  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Ouvrir un litige" description="Les deux mises restent bloquées jusqu’à la décision d’un arbitre. Joignez vos preuves (capture, vidéo) sur l’écran du match." verrouille={chargement}>
      <form id="form-litige" onSubmit={handleSubmit((v) => onOuvrir(v.motif))} className="space-y-5" noValidate>
        <Textarea label="Motif" placeholder="Ex. l’adversaire a quitté la partie volontairement à 2-0 pour moi." rows={4} {...register('motif')} erreur={errors.motif?.message} />
        <div className="flex justify-end gap-3">
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button type="submit" form="form-litige" variante="danger" chargement={chargement}>
            Ouvrir le litige
          </Button>
        </div>
      </form>
    </Modal>
  )
}

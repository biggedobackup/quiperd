import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { optionsPreuves } from '@/lib/requetes'
import { verifierPreuve } from '@/services/preuves'
import type { PreuveMatch } from '@/models/preuve-match'
import { Button } from '@/components/partages/button/button'
import { Modal } from '@/components/partages/modal/modal'
import { Textarea } from '@/components/partages/textarea/textarea'
import { LecteurPreuve } from '@/components/partages/lecteur-preuve/lecteur-preuve'
import { SkeletonCarte } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

/**
 * Liste des preuves d'un match côté admin, avec validation / rejet (motif obligatoire).
 * La validation des deux joueurs déclenche le règlement automatique côté backend.
 */
export function VerificationPreuves({ matchId, nomDe, onChangement }: { matchId: string; nomDe: (id: string) => string; onChangement?: () => void }) {
  const preuves = useQuery(optionsPreuves(matchId, 'admin'))
  const queryClient = useQueryClient()
  const verifier = useServerFn(verifierPreuve)
  const [aRejeter, setARejeter] = useState<PreuveMatch | null>(null)
  const { register, handleSubmit, reset, formState } = useForm<{ motifRejet: string }>()

  const mutation = useMutation({
    mutationFn: (d: { id: string; statut: 'validee' | 'rejetee'; motifRejet?: string }) => verifier({ data: d }),
    onSuccess: (r, d) => {
      setARejeter(null)
      reset()
      if (!r.ok) {
        toastErreur('Vérification impossible', r.message)
        return
      }
      toastSucces(d.statut === 'validee' ? 'Preuve validée' : 'Preuve rejetée', d.statut === 'validee' ? 'Si les deux joueurs ont une preuve validée, le match est réglé automatiquement.' : undefined)
      void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
      void queryClient.invalidateQueries({ queryKey: cles.litiges.tous })
      onChangement?.()
    },
  })

  if (preuves.isPending) return <SkeletonCarte nombre={2} />
  if (!preuves.data || preuves.data.length === 0) return <p className="rounded-2xl border border-dashed border-trait px-4 py-6 text-legende text-muet">Aucune preuve envoyée pour ce match.</p>

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {preuves.data.map((p) => (
          <LecteurPreuve
            key={p.id}
            preuve={p}
            role="admin"
            auteur={nomDe(p.utilisateurId)}
            actions={
              p.statut === 'en_attente' && (
                <span className="flex gap-2">
                  <Button taille="sm" className="min-h-11" variante="secondaire" onClick={() => mutation.mutate({ id: p.id, statut: 'validee' })} chargement={mutation.isPending && mutation.variables?.id === p.id} iconeDebut={icone.valider}>
                    Valider
                  </Button>
                  <Button taille="sm" className="min-h-11" variante="danger" onClick={() => setARejeter(p)} iconeDebut={icone.fermer}>
                    Rejeter
                  </Button>
                </span>
              )
            }
          />
        ))}
      </div>
      <Modal ouvert={aRejeter !== null} onFermer={() => setARejeter(null)} titre="Rejeter cette preuve" description="Le motif est visible par le joueur." taille="sm" verrouille={mutation.isPending}>
        <form
          id="form-rejet"
          onSubmit={handleSubmit((v) => aRejeter && mutation.mutate({ id: aRejeter.id, statut: 'rejetee', motifRejet: v.motifRejet }))}
          className="space-y-4"
        >
          <Textarea label="Motif du rejet" rows={3} {...register('motifRejet', { required: 'Motif obligatoire', minLength: { value: 5, message: '5 caractères minimum' } })} erreur={formState.errors.motifRejet?.message} />
          <div className="flex justify-end gap-3">
            <Button variante="fantome" onClick={() => setARejeter(null)}>
              Annuler
            </Button>
            <Button type="submit" form="form-rejet" variante="danger" chargement={mutation.isPending}>
              Rejeter la preuve
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

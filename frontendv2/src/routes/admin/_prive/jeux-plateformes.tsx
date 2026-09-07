import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone, iconePlateforme } from '@/lib/icones'
import { cles } from '@/lib/query'
import { optionsJeux, optionsPlateformes } from '@/lib/requetes'
import { decrireCategorie, decrireFamille, estCategorie, estFamille, optionsCategories, optionsFamilles } from '@/lib/catalogue'
import { creerJeu, modifierJeu, supprimerJeu } from '@/services/jeux'
import { creerPlateforme, modifierPlateforme, supprimerPlateforme } from '@/services/plateformes'
import type { Jeu, StatutCatalogue } from '@/models/jeu'
import type { Plateforme } from '@/models/plateforme'
import type { Resultat } from '@/server/http-client'
import type { OptionSelect } from '@/components/partages/select/select'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { Puce } from '@/components/partages/puce/puce'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/admin/_prive/jeux-plateformes')({
  head: () => ({ meta: [{ title: 'Administration — Jeux & plateformes' }] }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(optionsJeux(true)), context.queryClient.ensureQueryData(optionsPlateformes(true))])
  },
  component: PageCatalogue,
})

/** Vue commune jeu/plateforme : `groupe` = catégorie du jeu ou famille de la plateforme. */
interface Element {
  id: string
  nom: string
  statut: StatutCatalogue
  groupe: string
}

interface ActionsCatalogue {
  creer: (nom: string, groupe: string) => Promise<Resultat<Element>>
  modifier: (id: string, patch: { statut?: StatutCatalogue; groupe?: string }) => Promise<Resultat<Element>>
  supprimer: (id: string) => Promise<Resultat<void>>
}

const depuisJeu = (j: Jeu): Element => ({ id: j.id, nom: j.nom, statut: j.statut, groupe: j.categorie })
const depuisPlateforme = (p: Plateforme): Element => ({ id: p.id, nom: p.nom, statut: p.statut, groupe: p.famille })

function mapper<T>(r: Resultat<T>, f: (t: T) => Element): Resultat<Element> {
  return r.ok ? { ok: true, donnees: f(r.donnees) } : r
}

function PageCatalogue() {
  const jeux = useQuery(optionsJeux(true))
  const plateformes = useQuery(optionsPlateformes(true))
  const fnCreerJeu = useServerFn(creerJeu)
  const fnModifierJeu = useServerFn(modifierJeu)
  const fnSupprimerJeu = useServerFn(supprimerJeu)
  const fnCreerPlateforme = useServerFn(creerPlateforme)
  const fnModifierPlateforme = useServerFn(modifierPlateforme)
  const fnSupprimerPlateforme = useServerFn(supprimerPlateforme)

  const actionsJeux: ActionsCatalogue = {
    creer: async (nom, groupe) => mapper(await fnCreerJeu({ data: { nom, categorie: estCategorie(groupe) ? groupe : 'sport' } }), depuisJeu),
    modifier: async (id, patch) =>
      mapper(await fnModifierJeu({ data: { id, statut: patch.statut, categorie: estCategorie(patch.groupe) ? patch.groupe : undefined } }), depuisJeu),
    supprimer: (id) => fnSupprimerJeu({ data: { id } }),
  }
  const actionsPlateformes: ActionsCatalogue = {
    creer: async (nom, groupe) => mapper(await fnCreerPlateforme({ data: { nom, famille: estFamille(groupe) ? groupe : 'console' } }), depuisPlateforme),
    modifier: async (id, patch) =>
      mapper(await fnModifierPlateforme({ data: { id, statut: patch.statut, famille: estFamille(patch.groupe) ? patch.groupe : undefined } }), depuisPlateforme),
    supprimer: (id) => fnSupprimerPlateforme({ data: { id } }),
  }

  return (
    <>
      <EnTetePage
        surtitre="Catalogue"
        titre="Jeux & plateformes"
        description="Chaque jeu a une catégorie (sport, combat, course…) et chaque plateforme une famille (PC, console, mobile). Un élément inactif disparaît du site public et ne peut plus servir à créer un défi."
      />
      <div className="grid gap-6 2xl:grid-cols-2">
        <PanneauCatalogue
          titre="Jeux"
          icone={icone.jeu}
          elements={jeux.data?.map(depuisJeu)}
          chargement={jeux.isPending}
          cleCache={cles.jeux}
          actions={actionsJeux}
          placeholder="Nom du jeu"
          nomGroupe="Catégorie"
          groupes={optionsCategories}
          libelleGroupe={(v) => decrireCategorie(v).libelle}
          iconeGroupe={(v) => decrireCategorie(v).icone}
          iconeElement={(e) => decrireCategorie(e.groupe).icone}
        />
        <PanneauCatalogue
          titre="Plateformes"
          icone={icone.ecran}
          elements={plateformes.data?.map(depuisPlateforme)}
          chargement={plateformes.isPending}
          cleCache={cles.plateformes}
          actions={actionsPlateformes}
          placeholder="Nom de la plateforme"
          nomGroupe="Famille"
          groupes={optionsFamilles}
          libelleGroupe={(v) => decrireFamille(v).libelle}
          iconeGroupe={(v) => decrireFamille(v).icone}
          iconeElement={(e) => iconePlateforme(e.nom, e.groupe)}
        />
      </div>
    </>
  )
}

function PanneauCatalogue({
  titre,
  icone: ic,
  elements,
  chargement,
  cleCache,
  actions,
  placeholder,
  nomGroupe,
  groupes,
  libelleGroupe,
  iconeGroupe,
  iconeElement,
}: {
  titre: string
  icone: IconDefinition
  elements?: Element[]
  chargement: boolean
  cleCache: readonly string[]
  actions: ActionsCatalogue
  placeholder: string
  nomGroupe: string
  groupes: OptionSelect[]
  libelleGroupe: (valeur: string) => string
  iconeGroupe: (valeur: string) => IconDefinition
  iconeElement: (element: Element) => IconDefinition
}) {
  const queryClient = useQueryClient()
  const [nom, setNom] = useState('')
  const [groupeNouveau, setGroupeNouveau] = useState(groupes[0]?.valeur ?? '')
  const [recherche, setRecherche] = useState('')
  const [groupeFiltre, setGroupeFiltre] = useState<string>('tous')
  const [aSupprimer, setASupprimer] = useState<Element | null>(null)
  const invalider = () => void queryClient.invalidateQueries({ queryKey: [...cleCache] })

  const tous = elements ?? []
  const visibles = tous.filter(
    (e) => (groupeFiltre === 'tous' || e.groupe === groupeFiltre) && (recherche.trim() === '' || e.nom.toLowerCase().includes(recherche.trim().toLowerCase())),
  )
  const compteParGroupe = (g: string) => tous.filter((e) => e.groupe === g).length

  const mutCreer = useMutation({
    mutationFn: ({ n, g }: { n: string; g: string }) => actions.creer(n, g),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Ajout impossible', r.message)
        return
      }
      toastSucces(`${r.donnees.nom} ajouté`, `${nomGroupe} : ${libelleGroupe(r.donnees.groupe)}`)
      setNom('')
      invalider()
    },
  })
  const mutStatut = useMutation({
    mutationFn: (e: Element) => actions.modifier(e.id, { statut: e.statut === 'actif' ? 'inactif' : 'actif' }),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Modification impossible', r.message)
        return
      }
      toastSucces(`${r.donnees.nom} ${r.donnees.statut === 'actif' ? 'activé' : 'désactivé'}`)
      invalider()
    },
  })
  const mutGroupe = useMutation({
    mutationFn: ({ e, groupe }: { e: Element; groupe: string }) => actions.modifier(e.id, { groupe }),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Modification impossible', r.message)
        return
      }
      toastSucces(`${r.donnees.nom} → ${libelleGroupe(r.donnees.groupe)}`)
      invalider()
    },
  })
  const mutSupprimer = useMutation({
    mutationFn: (e: Element) => actions.supprimer(e.id),
    onSuccess: (r, e) => {
      setASupprimer(null)
      if (!r.ok) {
        toastErreur('Suppression impossible', r.message)
        return
      }
      toastSucces(`${e.nom} supprimé`)
      invalider()
    },
  })

  return (
    <section className="overflow-hidden rounded-2xl border border-trait bg-papier shadow-carte">
      <header className="flex items-center gap-3 border-b border-trait bg-gris px-5 py-3">
        <FontAwesomeIcon icon={ic} />
        <h3 className="text-h3">{titre}</h3>
        <span className="chiffres ml-auto text-legende text-muet">
          {visibles.length} / {tous.length}
        </span>
      </header>
      <div className="space-y-4 p-5">
        <Input
          aria-label={`Rechercher dans ${titre.toLowerCase()}`}
          placeholder={`Rechercher (${tous.length} ${titre.toLowerCase()})`}
          iconeDebut={icone.rechercher}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <div role="tablist" aria-label={nomGroupe} className="flex flex-wrap gap-2">
          <Puce actif={groupeFiltre === 'tous'} onClick={() => setGroupeFiltre('tous')} compte={tous.length}>
            Tous
          </Puce>
          {groupes.map((g) => (
            <Puce key={g.valeur} actif={groupeFiltre === g.valeur} onClick={() => setGroupeFiltre(g.valeur)} icone={iconeGroupe(g.valeur)} compte={compteParGroupe(g.valeur)}>
              {g.libelle}
            </Puce>
          ))}
        </div>

        {chargement ? (
          <SkeletonLignes lignes={4} colonnes={2} />
        ) : (
          <ul className="max-h-[560px] divide-y divide-trait overflow-y-auto rounded-xl border border-trait">
            {visibles.map((e) => (
              <li key={e.id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[auto_1fr_auto_auto_auto_auto]">
                <FontAwesomeIcon icon={iconeElement(e)} className="hidden text-muet sm:block" />
                <span className="min-w-0 truncate font-semibold">{e.nom}</span>
                <Select
                  aria-label={`${nomGroupe} de ${e.nom}`}
                  options={groupes}
                  value={e.groupe}
                  className="w-full sm:w-36"
                  disabled={mutGroupe.isPending && mutGroupe.variables?.e.id === e.id}
                  onChange={(ev) => mutGroupe.mutate({ e, groupe: ev.target.value })}
                />
                <BadgeStatut famille="catalogue" valeur={e.statut} />
                <Button taille="sm" variante="fantome" onClick={() => mutStatut.mutate(e)} chargement={mutStatut.isPending && mutStatut.variables?.id === e.id}>
                  {e.statut === 'actif' ? 'Désactiver' : 'Activer'}
                </Button>
                <button
                  type="button"
                  onClick={() => setASupprimer(e)}
                  className="flex size-11 items-center justify-center justify-self-end rounded-[10px] border border-transparent text-perte transition-colors hover:border-perte hover:bg-perte-fond"
                  aria-label={`Supprimer ${e.nom}`}
                >
                  <FontAwesomeIcon icon={icone.fermer} />
                </button>
              </li>
            ))}
            {visibles.length === 0 && <li className="px-3 py-4 text-legende text-muet">Aucun élément{recherche || groupeFiltre !== 'tous' ? ' pour ce filtre' : ''}.</li>}
          </ul>
        )}

        <form
          className="grid gap-2 border-t border-trait pt-4 sm:grid-cols-[1fr_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (nom.trim().length >= 2 && groupeNouveau) mutCreer.mutate({ n: nom.trim(), g: groupeNouveau })
          }}
        >
          <Input aria-label={`Nouveau ${titre.toLowerCase()}`} placeholder={placeholder} value={nom} onChange={(e) => setNom(e.target.value)} />
          <Select aria-label={nomGroupe} options={groupes} value={groupeNouveau} onChange={(e) => setGroupeNouveau(e.target.value)} />
          <Button type="submit" variante="volt" chargement={mutCreer.isPending} disabled={nom.trim().length < 2 || !groupeNouveau} iconeDebut={icone.ajouter}>
            Ajouter
          </Button>
        </form>
      </div>
      <ConfirmModal
        ouvert={aSupprimer !== null}
        onFermer={() => setASupprimer(null)}
        onConfirmer={() => aSupprimer && mutSupprimer.mutate(aSupprimer)}
        titre={`Supprimer ${aSupprimer?.nom} ?`}
        variante="danger"
        libelleConfirmer="Supprimer"
        chargement={mutSupprimer.isPending}
      >
        <p>Préférez la désactivation si des défis y font référence : la suppression est définitive.</p>
      </ConfirmModal>
    </section>
  )
}

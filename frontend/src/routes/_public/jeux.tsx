import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { optionsJeux, optionsPlateformes } from '@/lib/requetes'
import { icone } from '@/lib/icones'
import { BandeAppel, EnTetePublique } from '@/components/public/sections'
import { LienBouton } from '@/components/partages/button/button'
import { SectionJeux } from '@/components/public/section-jeux'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/jeux')({
  head: () => ({
    meta: [
      { title: 'Jeux & plateformes — QUI PERD' },
      {
        name: 'description',
        content: 'Le catalogue des jeux (sport, combat, course, tir, stratégie, cartes, arcade) et des plateformes (PC, consoles, mobile) sur lesquels lancer un défi QUI PERD.',
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(optionsJeux()), context.queryClient.ensureQueryData(optionsPlateformes())])
  },
  component: PageJeux,
})

function PageJeux() {
  const { connecte } = routeParent.useLoaderData()
  const { data: jeux } = useSuspenseQuery(optionsJeux())
  const { data: plateformes } = useSuspenseQuery(optionsPlateformes())
  return (
    <>
      <div>
        <EnTetePublique
          fond="noir"
          surtitre="Catalogue"
          titre="Jeux & plateformes."
          intro="Vous jouez avec vos propres identifiants sur PC, console ou mobile ; QUI PERD ne fait que tenir le score et l’argent."
        >
          {connecte ? (
            <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
              Créer un défi
            </LienBouton>
          ) : (
            <LienBouton to="/inscription" variante="volt" iconeFin={icone.suivant}>
              Créer un compte
            </LienBouton>
          )}
          <LienBouton to="/defis" variante="secondaire" iconeDebut={icone.ticket}>
            Voir les défis
          </LienBouton>
        </EnTetePublique>
      </div>
      <SectionJeux jeux={jeux} plateformes={plateformes} numero="01" complete />
      <BandeAppel connecte={connecte} />
    </>
  )
}

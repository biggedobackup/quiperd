import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { optionsJeux, optionsPlateformes } from '@/lib/requetes'
import { BandeAppel, Conteneur } from '@/components/public/sections'
import { SectionJeux } from '@/components/public/section-jeux'
import { Apparition } from '@/components/partages/animation/animation'

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
      <Apparition>
        <section className="border-b-2 border-encre bg-nuit text-craie">
          <Conteneur className="py-5 md:py-7">
            <span className="etiquette text-craie">Catalogue</span>
            <h1 className="mt-1 max-w-3xl text-h3 text-craie sm:text-h2">Jeux & plateformes.</h1>
            <p className="mt-2 max-w-xl text-legende text-craie/80">
              Vous jouez avec vos propres identifiants sur PC, console ou mobile ; QUI PERD ne fait que tenir le score et l’argent.
            </p>
          </Conteneur>
        </section>
      </Apparition>
      <SectionJeux jeux={jeux} plateformes={plateformes} numero="01" complete />
      <BandeAppel connecte={connecte} />
    </>
  )
}

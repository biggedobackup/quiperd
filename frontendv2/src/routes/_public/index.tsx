import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { optionsDefisOuverts, optionsJeux, optionsPlateformes, optionsRegles } from '@/lib/requetes'
import { formatPourcentage } from '@/lib/format'
import { icone } from '@/lib/icones'
import { Hero } from '@/components/public/hero'
import { Ticker } from '@/components/public/ticker'
import { BandeAppel, Conteneur, EnTeteSection, SectionCommentCaMarche, SectionSecurite } from '@/components/public/sections'
import { SectionJeux } from '@/components/public/section-jeux'
import { SectionDefisOuverts } from '@/components/public/section-defis-ouverts'
// Abonnement au salon public : la section « Défis en attente » et le compteur du hero vivent.
import { useDefisEnDirect } from '@/components/partages/defis-en-direct/defis-en-direct'
import { FaqAccordion, questionsFrequentes } from '@/components/public/faq-accordion'
import { LienBouton } from '@/components/partages/button/button'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/')({
  head: () => ({
    meta: [
      { title: 'QUI PERD — Défiez un adversaire, misez, le gagnant remporte tout' },
      { property: 'og:title', content: 'QUI PERD — le défi entre gamers' },
      {
        name: 'description',
        content:
          'Créez un défi sur votre jeu, un adversaire rejoint, les mises sont en séquestre : celui qui perd le match perd sa mise.',
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      context.queryClient.ensureQueryData(optionsDefisOuverts()),
    ])
  },
  component: Accueil,
})

function Accueil() {
  const { connecte } = routeParent.useLoaderData()
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const { data: jeux } = useSuspenseQuery(optionsJeux())
  const { data: plateformes } = useSuspenseQuery(optionsPlateformes())
  const { data: defisOuverts } = useSuspenseQuery(optionsDefisOuverts())
  const questions = questionsFrequentes(regles).slice(0, 4)

  // Section « Défis en attente » vivante : création, retrait et compteur du hero en direct.
  useDefisEnDirect()

  /**
   * Chiffres de la bande d'appel. Tous sortent de l'API affichée juste au-dessus : catalogue,
   * plateformes, défis réellement ouverts, commission en vigueur. Aucun compteur d'audience
   * décoratif — sur une plateforme où l'on dépose de l'argent, un chiffre affiché engage.
   */
  const chiffres = [
    { icone: icone.jeu, valeur: String(jeux.length), libelle: 'Jeux au catalogue' },
    { icone: icone.console, valeur: String(plateformes.length), libelle: 'Plateformes' },
    { icone: icone.defi, valeur: String(defisOuverts.length), libelle: 'Défis ouverts' },
    { icone: icone.trophee, valeur: formatPourcentage(regles.commissionDefi), libelle: 'Commission' },
  ]

  return (
    <>
      <Hero regles={regles} connecte={connecte} nombreDefis={defisOuverts.length} />
      <Ticker jeux={jeux} plateformes={plateformes} regles={regles} />
      <SectionDefisOuverts defis={defisOuverts} connecte={connecte} numero="01" />
      <SectionCommentCaMarche regles={regles} numero="02" />
      <SectionJeux jeux={jeux} plateformes={plateformes} numero="03" />
      <SectionSecurite numero="04" />
      <section className="border-b border-trait bg-ardoise py-16 md:py-20">
        <Conteneur>
          <EnTeteSection numero="05" titre="Questions fréquentes" />
          <FaqAccordion questions={questions} />
          <div className="mt-8">
            <LienBouton to="/aide" variante="secondaire" iconeFin={icone.suivant}>
              Toute l’aide
            </LienBouton>
          </div>
        </Conteneur>
      </section>
      <BandeAppel connecte={connecte} chiffres={chiffres} />
    </>
  )
}

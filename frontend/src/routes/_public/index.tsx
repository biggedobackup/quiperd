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
import { SectionApplication } from '@/components/public/section-application'
import { obtenirLiensApplication } from '@/server/application-fns'
// Abonnement au salon public : la section « Défis en attente » et le compteur du hero vivent.
import { useDefisEnDirect } from '@/components/partages/defis-en-direct/defis-en-direct'
import { FaqAccordion, questionsFrequentes } from '@/components/public/faq-accordion'
import { LienBouton } from '@/components/partages/button/button'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/')({
  head: () => ({
    meta: [
      { title: 'Défis en Ligne — Défiez un adversaire, misez, le gagnant remporte tout' },
      { property: 'og:title', content: 'Défis en Ligne — le défi entre gamers' },
      {
        name: 'description',
        content:
          'Créez un défi sur votre jeu, un adversaire rejoint, les mises sont en séquestre : celui qui perd le match perd sa mise.',
      },
    ],
  }),
  loader: async ({ context }) => {
    // Tout ce que la page affiche est attendu ICI, en parallèle : les adresses des magasins
    // d'applications comme les données de l'API. Un `prefetch` laisserait la section se peindre
    // vide puis se remplir, c'est-à-dire exactement le clignotement qu'on ne veut plus.
    const [liensApplication] = await Promise.all([
      obtenirLiensApplication(),
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      context.queryClient.ensureQueryData(optionsDefisOuverts()),
    ])
    return { liensApplication }
  },
  component: Accueil,
})

function Accueil() {
  const { connecte } = routeParent.useLoaderData()
  const { liensApplication } = Route.useLoaderData()
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
      {/*
        L'application monte en 02, juste après les défis en attente : c'est là que le visiteur
        vient de voir ce qui se joue en ce moment, donc le moment où l'emporter dans sa poche a
        le plus de sens. Les sections suivantes sont décalées d'un rang — une section 06 coincée
        entre 01 et 02 se lirait comme un bogue, pas comme un choix.
      */}
      <SectionApplication liens={liensApplication} numero="02" />
      <SectionCommentCaMarche regles={regles} numero="03" />
      <SectionJeux jeux={jeux} plateformes={plateformes} numero="04" />
      <SectionSecurite numero="05" />
      <section className="border-b border-trait bg-ardoise py-16 md:py-20">
        <Conteneur>
          <EnTeteSection numero="06" titre="Questions fréquentes" />
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

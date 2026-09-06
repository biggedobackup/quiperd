import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { optionsRegles } from '@/lib/requetes'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import { BandeAppel, Conteneur, SectionCommentCaMarche, SectionSecurite } from '@/components/public/sections'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { Apparition } from '@/components/partages/animation/animation'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/comment-ca-marche')({
  head: () => ({
    meta: [
      { title: 'Comment ça marche — QUI PERD' },
      { name: 'description', content: 'Créer un défi, rejoindre, jouer, déclarer le score, envoyer une preuve : le parcours complet d’un défi QUI PERD et le règlement des mises.' },
    ],
  }),
  component: CommentCaMarche,
})

function CommentCaMarche() {
  const { connecte } = routeParent.useLoaderData()
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const mise = 2000
  const total = mise * 2
  const commission = total * regles.commissionDefi
  const gain = total - commission

  return (
    <>
      <Apparition>
        <section className="border-b-2 border-encre bg-nuit text-craie">
          <Conteneur className="py-5 md:py-7">
            <span className="etiquette text-craie">Le parcours d’un défi</span>
            <h1 className="mt-1 max-w-3xl text-h3 text-craie sm:text-h2">Un match, deux mises, un gagnant.</h1>
          </Conteneur>
        </section>
      </Apparition>
      <SectionCommentCaMarche regles={regles} complete />
      <section className="border-b-2 border-encre bg-papier py-16 md:py-24">
        <Conteneur className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="chiffres etiquette inline-block border-2 border-encre bg-volt px-2 py-1 text-nuit">02</span>
            <h2 className="mt-4 text-h1 md:text-display-sm">Le règlement, chiffré</h2>
            <p className="mt-4 text-corps text-muet">Exemple avec deux mises de {formatMontant(mise)}. La commission est celle appliquée aujourd’hui par la plateforme.</p>
            <dl className="mt-8 divide-y-2 divide-trait border-2 border-encre">
              <Ligne libelle="Mise de Kader225 (bloquée)" valeur={formatMontant(mise)} />
              <Ligne libelle="Mise de Moussa10 (bloquée)" valeur={formatMontant(mise)} />
              <Ligne libelle="Total en séquestre" valeur={formatMontant(total)} fort />
              <Ligne libelle={`Commission QUI PERD (${formatPourcentage(regles.commissionDefi)})`} valeur={`− ${formatMontant(commission)}`} />
              <Ligne libelle="Gain crédité au gagnant" valeur={formatMontant(gain)} fort volt />
            </dl>
            <p className="mt-4 flex items-start gap-2 text-legende text-muet">
              <FontAwesomeIcon icon={icone.info} className="mt-0.5" />
              Défi annulé ou expiré sans adversaire : la mise est rendue moins la commission de la plateforme ({formatPourcentage(regles.commissionDefi)}), toujours prélevée quand une mise est restituée.
            </p>
          </div>
          <TableauScore joueur1="Kader225" joueur2="Moussa10" score1={3} score2={1} gagnant={1} etiquette={`Défi · mise ${formatMontant(mise)}`} sousTitre={`Kader225 remporte ${formatMontant(gain)}`} />
        </Conteneur>
      </section>
      <SectionSecurite numero="03" />
      <BandeAppel connecte={connecte} />
    </>
  )
}

function Ligne({ libelle, valeur, fort = false, volt = false }: { libelle: string; valeur: string; fort?: boolean; volt?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${volt ? 'bg-volt text-nuit' : ''}`}>
      <dt className={`text-legende ${fort ? 'font-bold' : ''}`}>{libelle}</dt>
      <dd className={`chiffres ${fort ? 'text-h3 font-bold' : 'text-corps'}`}>{valeur}</dd>
    </div>
  )
}

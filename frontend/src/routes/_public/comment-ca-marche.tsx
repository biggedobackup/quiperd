import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { optionsRegles } from '@/lib/requetes'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import { BandeAppel, Conteneur, EnTetePublique, SectionCommentCaMarche, SectionSecurite } from '@/components/public/sections'
import { LienBouton } from '@/components/partages/button/button'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/comment-ca-marche')({
  head: () => ({
    meta: [
      { title: 'Comment ça marche — Défis en Ligne' },
      { name: 'description', content: 'Créer un défi, rejoindre, jouer, déclarer le résultat, envoyer une preuve : le parcours complet d’un défi Défis en Ligne et le règlement des mises.' },
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
      <div>
        <EnTetePublique fond="noir" surtitre="Le parcours d’un défi" titre="Un match, deux mises, un gagnant.">
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
      <SectionCommentCaMarche regles={regles} complete />
      <section className="border-b border-trait bg-craie py-16 md:py-20">
        <Conteneur className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="chiffres etiquette inline-block rounded-full bg-vert-pale px-3 py-1.5 text-vert">02</span>
            <h2 className="mt-4 text-h1 md:text-display-sm">Le règlement, chiffré</h2>
            <p className="mt-4 text-corps text-muet">Exemple avec deux mises de {formatMontant(mise)}. La commission est celle appliquée aujourd’hui par la plateforme.</p>
            <dl className="mt-8 overflow-hidden rounded-2xl border border-trait divide-y divide-trait">
              <Ligne libelle="Mise de Kader225 (bloquée)" valeur={formatMontant(mise)} />
              <Ligne libelle="Mise de Moussa10 (bloquée)" valeur={formatMontant(mise)} />
              <Ligne libelle="Total en séquestre" valeur={formatMontant(total)} fort />
              <Ligne libelle={`Commission Défis en Ligne (${formatPourcentage(regles.commissionDefi)})`} valeur={`− ${formatMontant(commission)}`} />
              <Ligne libelle="Gain crédité au gagnant" valeur={formatMontant(gain)} fort volt />
            </dl>
            <p className="mt-4 flex items-start gap-2 text-legende text-muet">
              <FontAwesomeIcon icon={icone.info} className="mt-0.5" />
              Défi annulé ou expiré sans adversaire : personne n’a joué, la mise est rendue <strong>en totalité</strong>, sans commission.
            </p>
          </div>
          <TableauScore joueur1="Kader225" joueur2="Moussa10" score1={1} score2={0} gagnant={1} etiquette={`Défi · mise ${formatMontant(mise)}`} sousTitre={`Kader225 remporte ${formatMontant(gain)}`} />
        </Conteneur>
      </section>
      <SectionSecurite numero="03" />
      <BandeAppel connecte={connecte} />
    </>
  )
}

function Ligne({ libelle, valeur, fort = false, volt = false }: { libelle: string; valeur: string; fort?: boolean; volt?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 ${volt ? 'bg-vert text-craie' : ''}`}>
      <dt className={`text-legende ${fort ? 'font-bold' : ''}`}>{libelle}</dt>
      <dd className={`chiffres ${fort ? 'text-h3 font-bold' : 'text-corps'}`}>{valeur}</dd>
    </div>
  )
}

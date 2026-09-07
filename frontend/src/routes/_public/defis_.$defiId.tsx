import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { icone } from '@/lib/icones'
import { decrireCategorie } from '@/lib/catalogue'
import { formatMontant, formatDate } from '@/lib/format'
import { detailDefiPublic } from '@/services/defis'
import { obtenirSiteUrl } from '@/server/session-fns'
import { Conteneur, EnTetePublique } from '@/components/public/sections'
import { LienBouton } from '@/components/partages/button/button'
import { Badge } from '@/components/partages/badge/badge'
import { CompteAReboursDefi } from '@/components/partages/defis-en-direct/animation-defis'

const routeParent = getRouteApi('/_public')

/**
 * Fiche PUBLIQUE d'un défi — la page servie par un lien de partage.
 *
 * Elle existe pour une raison précise : après avoir créé un défi, un joueur envoie le lien à
 * quelqu'un, et ce quelqu'un doit pouvoir voir de quoi il s'agit — le jeu, la plateforme, la
 * mise, qui a lancé le défi — AVANT de se connecter ou de créer un compte. Un lien qui tombe
 * sur un écran de connexion ne se partage pas.
 *
 * Ce qu'elle ne fait pas : rejoindre. Bloquer une mise engage de l'argent, cela demande un
 * compte avec une adresse confirmée. Le bouton emmène donc vers la fiche joueur, en passant
 * par la connexion si besoin (`?vers=`), qui y ramène une fois l'authentification faite.
 */
export const Route = createFileRoute('/_public/defis_/$defiId')({
  loader: async ({ params }) => {
    const [defi, siteUrl] = await Promise.all([
      detailDefiPublic({ data: { id: params.defiId } }).catch(() => null),
      obtenirSiteUrl(),
    ])
    if (!defi) throw notFound()
    return { defi, siteUrl }
  },
  head: ({ loaderData }) => {
    const d = loaderData?.defi
    if (!d) return {}
    const titre = `Défi ${d.jeuNom} — ${formatMontant(d.montantMise, d.devise)} par joueur`
    const description = `${d.createurNom} lance un défi sur ${d.jeuNom} (${d.plateformeNom}). Celui qui perd le match perd sa mise.`
    // Open Graph renseigné : un lien partagé dans une conversation doit s'afficher avec le
    // jeu et la mise, pas avec une vignette vide.
    return {
      meta: [
        { title: `${titre} — QUI PERD` },
        { name: 'description', content: description },
        { property: 'og:title', content: titre },
        { property: 'og:description', content: description },
        { property: 'og:url', content: `${loaderData?.siteUrl ?? ''}/defis/${d.id}` },
      ],
    }
  },
  component: DefiPartage,
})

function DefiPartage() {
  const { connecte } = routeParent.useLoaderData()
  const { defi } = Route.useLoaderData()
  const categorie = decrireCategorie(defi.jeuCategorie)
  const ouvert = defi.statut === 'ouvert'
  const versFicheJoueur = `/joueur/defis/${defi.id}`

  return (
    <>
      <EnTetePublique
        fond="noir"
        surtitre={
          <>
            <span className="flex items-center gap-2">
              {categorie.libelle} · {defi.jeuNom}
            </span>
          </>
        }
        titre={`${formatMontant(defi.montantMise, defi.devise)} par joueur.`}
        intro={`${defi.createurNom} attend un adversaire sur ${defi.plateformeNom}. Les deux mises sont bloquées en séquestre : celui qui perd le match perd la sienne.`}
      >
        {ouvert ? (
          connecte ? (
            <LienBouton to="/joueur/defis/$defiId" params={{ defiId: defi.id }} variante="volt" iconeDebut={icone.poigneeDeMain}>
              Voir et rejoindre
            </LienBouton>
          ) : (
            <LienBouton to="/connexion" search={{ vers: versFicheJoueur }} variante="volt" iconeFin={icone.suivant}>
              Se connecter pour rejoindre
            </LienBouton>
          )
        ) : null}
        <LienBouton to="/defis" variante="secondaire">
          Tous les défis ouverts
        </LienBouton>
      </EnTetePublique>

      <section className="border-b border-trait bg-craie py-12 md:py-16">
        <Conteneur>
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-trait bg-papier">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-trait px-5 py-4">
              <span className="etiquette text-muet">Le défi</span>
              <Badge variante={ouvert ? "gain" : "neutre"}>{ouvert ? 'Ouvert' : 'Plus disponible'}</Badge>
            </div>
            <dl className="divide-y divide-trait">
              <Ligne libelle="Jeu" valeur={`${defi.jeuNom} · ${categorie.libelle}`} />
              <Ligne libelle="Plateforme" valeur={defi.plateformeNom} />
              <Ligne libelle="Mise par joueur" valeur={formatMontant(defi.montantMise, defi.devise)} chiffres />
              <Ligne libelle="Lancé par" valeur={defi.createurNom} />
              <Ligne libelle="Créé le" valeur={formatDate(defi.dateCreation)} />
              {ouvert && defi.dateExpiration && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <dt className="etiquette text-muet">Expiration</dt>
                  <dd>
                    <CompteAReboursDefi defiId={defi.id} echeance={defi.dateExpiration} />
                  </dd>
                </div>
              )}
              {defi.regles && <Ligne libelle="Règles du match" valeur={defi.regles} />}
            </dl>
          </div>

          {!ouvert && (
            <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-trait bg-gris px-4 py-3 text-legende text-muet">
              Ce défi n’attend plus d’adversaire. Il en reste d’autres dans l’arène.
            </p>
          )}
        </Conteneur>
      </section>
    </>
  )
}

function Ligne({ libelle, valeur, chiffres = false }: { libelle: string; valeur: string; chiffres?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <dt className="etiquette text-muet">{libelle}</dt>
      <dd className={chiffres ? 'chiffres text-h3 font-bold' : 'text-corps'}>{valeur}</dd>
    </div>
  )
}

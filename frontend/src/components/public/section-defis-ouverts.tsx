import { icone } from '@/lib/icones'
import type { DefiListe } from '@/models/defi'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { Conteneur, EnTeteSection } from './sections'
import { CarteDefiPublique } from './carte-defi-publique'
import { ElementAnime, ListeAnimee } from '@/components/partages/defis-en-direct/animation-defis'
import { LienBouton } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'

/**
 * Accueil : les derniers défis en attente d'adversaire, poussés en direct par le hub
 * (l'abonnement est posé par la route, `useDefisEnDirect`).
 */
export function SectionDefisOuverts({ defis, connecte, numero = '01' }: { defis: DefiListe[]; connecte: boolean; numero?: string }) {
  const visibles = defis.slice(0, 6)
  return (
    <section className="border-b border-trait bg-craie py-16 md:py-20">
      <Conteneur>
        <EnTeteSection
          numero={numero}
          titre="Défis en attente d’adversaire"
          intro="L’arène en direct : un défi rejoint bloque les deux mises, le match se joue tout de suite."
        />
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <IndicateurDirect variante="etiquette" avecCompteur cliquable />
          <span className="chiffres text-legende text-muet">
            {defis.length} {defis.length > 1 ? 'défis ouverts' : 'défi ouvert'}
          </span>
        </div>
        {visibles.length === 0 ? (
          <EmptyState
            icone={icone.defi}
            titre="Aucun défi en attente pour le moment"
            description="Soyez le premier à lancer un défi : votre mise reste bloquée en séquestre et vous est rendue en totalité si personne ne rejoint."
            action={
              connecte ? (
                <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
                  Créer un défi
                </LienBouton>
              ) : (
                <LienBouton to="/inscription" variante="volt" iconeFin={icone.suivant}>
                  Créer un compte
                </LienBouton>
              )
            }
          />
        ) : (
          <ListeAnimee className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((d, i) => (
              <ElementAnime key={d.id} index={i}>
                <CarteDefiPublique defi={d} connecte={connecte} />
              </ElementAnime>
            ))}
          </ListeAnimee>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <LienBouton to="/defis" variante="secondaire" iconeFin={icone.suivant}>
            Tous les défis ouverts
          </LienBouton>
          {connecte && (
            <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
              Créer un défi
            </LienBouton>
          )}
        </div>
      </Conteneur>
    </section>
  )
}

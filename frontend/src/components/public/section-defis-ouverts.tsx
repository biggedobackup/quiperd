import { icone } from '@/lib/icones'
import type { DefiListe } from '@/models/defi'
import { Conteneur, EnTeteSection } from './sections'
import { CarteDefiPublique } from './carte-defi-publique'
import { Badge } from '@/components/partages/badge/badge'
import { LienBouton } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'

/** Accueil : les derniers défis en attente d'adversaire, lus en direct sur l'API publique. */
export function SectionDefisOuverts({ defis, connecte, numero = '01' }: { defis: DefiListe[]; connecte: boolean; numero?: string }) {
  const visibles = defis.slice(0, 6)
  return (
    <section className="border-b-2 border-encre bg-craie py-16 md:py-24">
      <Conteneur>
        <EnTeteSection numero={numero} titre="Défis en attente d’adversaire" intro="L’arène en direct : un défi rejoint bloque les deux mises, le match se joue tout de suite." />
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Badge variante="volt" actif>
            En direct
          </Badge>
          <span className="chiffres text-legende text-muet">
            {defis.length} {defis.length > 1 ? 'défis ouverts' : 'défi ouvert'}
          </span>
        </div>
        {visibles.length === 0 ? (
          <EmptyState
            icone={icone.defi}
            titre="Aucun défi en attente pour le moment"
            description="Soyez le premier à lancer un défi : votre mise reste bloquée en séquestre et vous est rendue, moins la commission, si personne ne rejoint."
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
          <Cascade className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((d) => (
              <ElementCascade key={d.id}>
                <CarteDefiPublique defi={d} connecte={connecte} />
              </ElementCascade>
            ))}
          </Cascade>
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

import type { ReactNode } from 'react'
import { Conteneur } from './sections'

export interface SectionLegale {
  titre: string
  contenu: ReactNode
}

/** Gabarit des pages légales : sommaire numéroté à gauche, sections à droite. */
export function PageLegale({ titre, miseAJour, sections }: { titre: string; miseAJour: string; sections: SectionLegale[] }) {
  return (
    <div>
      <Conteneur className="py-14 md:py-20">
        <div className="max-w-3xl border-b border-trait pb-8">
          <span className="etiquette text-muet">Document légal · mis à jour le {miseAJour}</span>
          <h1 className="mt-3 hyphens-auto break-words text-h2 sm:text-h1 md:text-display-sm">{titre}</h1>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[260px_1fr]">
          <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Sommaire">
            <ol className="space-y-2 border-l border-trait pl-4">
              {sections.map((s, i) => (
                <li key={s.titre}>
                  <a href={`#section-${i + 1}`} className="inline-flex min-h-11 items-center text-legende text-muet transition-colors hover:text-encre">
                    <span className="chiffres mr-2">{String(i + 1).padStart(2, '0')}</span>
                    {s.titre}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="space-y-10">
            {sections.map((s, i) => (
              <section key={s.titre} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-h3">
                  <span className="chiffres text-muet">{String(i + 1).padStart(2, '0')}</span>
                  {s.titre}
                </h2>
                <div className="prose-qp mt-3 space-y-3 text-corps text-encre/85">{s.contenu}</div>
              </section>
            ))}
          </div>
        </div>
      </Conteneur>
    </div>
  )
}

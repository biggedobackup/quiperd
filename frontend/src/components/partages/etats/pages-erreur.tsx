import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { classesBouton } from '../button/button'

/** 404 : tableau de score « 0 — 4 » clin d'œil, retour à l'accueil. */
export function PageIntrouvable() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <p className="chiffres text-display font-bold text-encre">4 — 0 — 4</p>
      <h1 className="mt-6 text-h2">Page introuvable</h1>
      <p className="mt-2 max-w-md text-corps text-muet">Ce ticket n’existe pas ou n’est plus valable.</p>
      <Link to="/" className={`${classesBouton('primaire', 'md')} mt-8`}>
        <FontAwesomeIcon icon={icone.accueil} /> Retour à l’accueil
      </Link>
    </main>
  )
}

export function PageErreur({ error, reset }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-xl border border-perte bg-perte-fond text-perte">
        <FontAwesomeIcon icon={icone.attention} className="text-xl" />
      </span>
      <h1 className="mt-6 text-h2">Une erreur est survenue</h1>
      <p className="mt-2 max-w-md text-corps text-muet">{error.message || 'Le serveur n’a pas répondu comme prévu.'}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={classesBouton('primaire', 'md')}>
          <FontAwesomeIcon icon={icone.rafraichir} /> Réessayer
        </button>
        <Link to="/" className={classesBouton('secondaire', 'md')}>
          Accueil
        </Link>
      </div>
    </main>
  )
}

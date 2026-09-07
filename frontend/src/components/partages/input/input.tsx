import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export interface ProprietesInput extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  aide?: ReactNode
  erreur?: string
  iconeDebut?: IconDefinition
  suffixe?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export const CLASSES_CHAMP =
  'h-11 w-full rounded-[10px] border border-trait bg-papier px-3.5 text-corps text-encre placeholder:text-muet transition-colors duration-150 focus:border-vert focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-perte'

/** Champ texte avec libellé, aide et message d'erreur (états explicites). */
export function Input({ label, aide, erreur, iconeDebut, suffixe, className = '', id, ref, ...reste }: ProprietesInput) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={idChamp} className="etiquette text-muet">
          {label}
        </label>
      )}
      <div className="relative">
        {iconeDebut && (
          <FontAwesomeIcon
            icon={iconeDebut}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muet"
          />
        )}
        <input
          id={idChamp}
          ref={ref}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? `${idChamp}-erreur` : aide ? `${idChamp}-aide` : undefined}
          className={`${CLASSES_CHAMP} ${iconeDebut ? 'pl-10' : ''} ${suffixe ? 'pr-16' : ''}`}
          {...reste}
        />
        {suffixe && (
          <span className="chiffres pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-legende text-muet">
            {suffixe}
          </span>
        )}
      </div>
      {erreur ? (
        <p id={`${idChamp}-erreur`} className="text-legende font-semibold text-perte" role="alert">
          {erreur}
        </p>
      ) : (
        aide && (
          <p id={`${idChamp}-aide`} className="text-legende text-muet">
            {aide}
          </p>
        )
      )}
    </div>
  )
}

import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { CLASSES_CHAMP } from '../input/input'

export interface OptionSelect {
  valeur: string
  libelle: string
  desactive?: boolean
}

/** Groupe d'options rendu en `<optgroup>` (catalogue par catégorie ou par famille). */
export interface GroupeOptions {
  libelle: string
  options: OptionSelect[]
}

export interface ProprietesSelect extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  aide?: ReactNode
  erreur?: string
  options?: OptionSelect[]
  groupes?: GroupeOptions[]
  placeholder?: string
  ref?: Ref<HTMLSelectElement>
}

/** Liste déroulante native (accessible, fiable en mobile) habillée comme les champs. */
export function Select({ label, aide, erreur, options = [], groupes = [], placeholder, className = '', id, ref, ...reste }: ProprietesSelect) {
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
        <select
          id={idChamp}
          ref={ref}
          aria-invalid={erreur ? true : undefined}
          className={`${CLASSES_CHAMP} appearance-none pr-10`}
          {...reste}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.valeur} value={o.valeur} disabled={o.desactive}>
              {o.libelle}
            </option>
          ))}
          {groupes.map((g) => (
            <optgroup key={g.libelle} label={g.libelle}>
              {g.options.map((o) => (
                <option key={o.valeur} value={o.valeur} disabled={o.desactive}>
                  {o.libelle}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <FontAwesomeIcon
          icon={icone.chevronBas}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muet"
        />
      </div>
      {erreur ? (
        <p className="text-legende font-semibold text-perte" role="alert">
          {erreur}
        </p>
      ) : (
        aide && <p className="text-legende text-muet">{aide}</p>
      )}
    </div>
  )
}

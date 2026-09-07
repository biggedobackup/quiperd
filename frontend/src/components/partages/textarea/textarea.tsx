import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'

export interface ProprietesTextarea extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  aide?: ReactNode
  erreur?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ label, aide, erreur, className = '', id, ref, rows = 4, ...reste }: ProprietesTextarea) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={idChamp} className="etiquette text-muet">
          {label}
        </label>
      )}
      <textarea
        id={idChamp}
        ref={ref}
        rows={rows}
        aria-invalid={erreur ? true : undefined}
        className="w-full resize-y rounded-[10px] border border-trait bg-papier px-3.5 py-2.5 text-corps text-encre placeholder:text-muet transition-colors duration-150 focus:border-vert focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-perte"
        {...reste}
      />
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

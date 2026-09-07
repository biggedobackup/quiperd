import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'

export type VarianteBouton = 'primaire' | 'secondaire' | 'volt' | 'danger' | 'fantome' | 'lien'
export type TailleBouton = 'sm' | 'md' | 'lg'

/**
 * Refonte v2 : angles arrondis et bordure fine à la place du trait de 2 px. La typographie du
 * bouton ne bouge pas (Unbounded, capitales) ; le vert plein porte l'action principale avec du
 * texte blanc, le secondaire est un contour gris discret.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[10px] border font-titre uppercase tracking-wider font-bold select-none whitespace-nowrap transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const VARIANTES: Record<VarianteBouton, string> = {
  primaire: 'border-transparent bg-vert text-craie shadow-carte hover:bg-vert-sombre',
  secondaire: 'border-trait bg-papier text-encre hover:border-encre hover:bg-gris',
  // `volt` reste le nom de l'action principale dans tout le code : la refonte en fait le bouton vert.
  volt: 'border-transparent bg-vert text-craie shadow-carte hover:bg-vert-sombre',
  danger: 'border-transparent bg-perte text-craie hover:bg-encre',
  fantome: 'border-transparent bg-transparent text-muet hover:bg-gris hover:text-encre',
  lien: 'border-transparent bg-transparent normal-case tracking-normal font-texte font-semibold underline decoration-2 underline-offset-4 hover:decoration-vert',
}

const TAILLES: Record<TailleBouton, string> = {
  sm: 'h-11 px-4 text-[11px] sm:h-9',
  md: 'h-11 px-5 text-[12px]',
  lg: 'h-14 px-7 text-[13px]',
}

export function classesBouton(variante: VarianteBouton = 'primaire', taille: TailleBouton = 'md', bloc = false) {
  return [BASE, VARIANTES[variante], TAILLES[taille], bloc ? 'w-full' : ''].join(' ')
}

export interface ProprietesBouton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBouton
  taille?: TailleBouton
  chargement?: boolean
  iconeDebut?: IconDefinition
  iconeFin?: IconDefinition
  bloc?: boolean
}

export function Button({
  variante = 'primaire',
  taille = 'md',
  chargement = false,
  iconeDebut,
  iconeFin,
  bloc = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...reste
}: ProprietesBouton) {
  return (
    <button
      type={type}
      className={`${classesBouton(variante, taille, bloc)} ${className}`}
      disabled={disabled || chargement}
      aria-busy={chargement || undefined}
      {...reste}
    >
      {chargement ? (
        <FontAwesomeIcon icon={icone.chargement} className="animate-rotation" />
      ) : (
        iconeDebut && <FontAwesomeIcon icon={iconeDebut} />
      )}
      {children}
      {iconeFin && !chargement && <FontAwesomeIcon icon={iconeFin} />}
    </button>
  )
}

export interface ProprietesLienBouton extends Omit<LinkProps, 'className' | 'children'> {
  variante?: VarianteBouton
  taille?: TailleBouton
  bloc?: boolean
  className?: string
  iconeDebut?: IconDefinition
  iconeFin?: IconDefinition
  children?: ReactNode
}

/** Lien de navigation habillé comme un bouton (même système, même retour visuel). */
export function LienBouton({
  variante = 'primaire',
  taille = 'md',
  bloc = false,
  className = '',
  iconeDebut,
  iconeFin,
  children,
  ...reste
}: ProprietesLienBouton) {
  return (
    <Link className={`${classesBouton(variante, taille, bloc)} ${className}`} {...reste}>
      {iconeDebut && <FontAwesomeIcon icon={iconeDebut} />}
      {children}
      {iconeFin && <FontAwesomeIcon icon={iconeFin} />}
    </Link>
  )
}

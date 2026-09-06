import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

/** Presets de mouvement : uniquement transform/opacity, plafonds de durée courts. */
export const variantesApparition: Variants = {
  cache: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.24, ease: 'easeOut' } },
}

export const variantesCascade: Variants = {
  cache: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}

export const variantesElement: Variants = {
  cache: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}

/** Apparition d'un bloc à l'entrée (page, section). */
export function Apparition({ children, className = '', delai = 0 }: { children: ReactNode; className?: string; delai?: number }) {
  const reduit = useReducedMotion()
  if (reduit) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut', delay: delai }}
    >
      {children}
    </motion.div>
  )
}

/** Apparition au défilement (sections du site public). */
export function ApparitionAuDefilement({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduit = useReducedMotion()
  if (reduit) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Conteneur de liste en cascade (40 ms entre éléments, plafond implicite par le nombre d'enfants). */
export function Cascade({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduit = useReducedMotion()
  if (reduit) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={variantesCascade} initial="cache" animate="visible">
      {children}
    </motion.div>
  )
}

export function ElementCascade({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduit = useReducedMotion()
  if (reduit) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={variantesElement}>
      {children}
    </motion.div>
  )
}

import { useEffect, useRef, useState } from 'react'

/**
 * Seuils communs à tous les états d'attente de l'application.
 *
 * `SEUIL` : en dessous, on ne montre rien. Une donnée qui arrive en 40 ms n'a pas besoin
 * d'être annoncée, et le squelette qui apparaît puis disparaît aussitôt se lit comme un
 * clignotement — c'est précisément ce que l'on veut éviter.
 *
 * `MINIMUM` : une fois le squelette affiché, il reste au moins ce temps-là. Sans ce
 * plancher, une réponse qui arrive juste après le seuil produirait le même battement
 * d'œil, en pire : le squelette apparaîtrait pour disparaître dans la foulée.
 */
export const SEUIL_ATTENTE_MS = 150
export const MINIMUM_ATTENTE_MS = 350

/**
 * Dit s'il faut afficher un squelette pour une donnée en cours de chargement.
 *
 * ```tsx
 * const attente = useAttenteDouce(matchs.isPending)
 * {attente ? <SkeletonCarte nombre={3} /> : <ListeDesMatchs … />}
 * ```
 *
 * Règle du projet : **tout squelette passe par ici**. Brancher directement `isPending`
 * sur l'affichage rend le chargement visible même quand il dure trois images, et c'est
 * ce clignotement que les joueurs remarquent — pas l'attente elle-même.
 */
export function useAttenteDouce(enChargement: boolean): boolean {
  const [visible, setVisible] = useState(false)
  const depuis = useRef<number | null>(null)

  useEffect(() => {
    if (enChargement) {
      const minuterie = window.setTimeout(() => {
        depuis.current = Date.now()
        setVisible(true)
      }, SEUIL_ATTENTE_MS)
      return () => window.clearTimeout(minuterie)
    }

    if (depuis.current === null) {
      setVisible(false)
      return
    }
    // Le squelette est visible : on le garde jusqu'au plancher avant de le retirer.
    const restant = MINIMUM_ATTENTE_MS - (Date.now() - depuis.current)
    if (restant <= 0) {
      depuis.current = null
      setVisible(false)
      return
    }
    const minuterie = window.setTimeout(() => {
      depuis.current = null
      setVisible(false)
    }, restant)
    return () => window.clearTimeout(minuterie)
  }, [enChargement])

  return visible
}

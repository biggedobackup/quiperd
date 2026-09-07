import { useState } from 'react'
import { icone } from '@/lib/icones'
import { Button } from '@/components/partages/button/button'
import { toastInfo, toastSucces } from '@/components/partages/toast/toast'

/**
 * Partage d'un défi : envoie le lien public `/defis/<id>` à qui l'on veut.
 *
 * Deux comportements, dans cet ordre :
 *   1. `navigator.share` s'il existe — sur téléphone, c'est la feuille de partage du système,
 *      donc WhatsApp, Telegram, SMS ou n'importe quelle application installée. C'est ce qu'un
 *      joueur attend en appuyant sur « Partager ».
 *   2. sinon, copie dans le presse-papiers, avec un message qui le dit. Sur un ordinateur de
 *      bureau, `navigator.share` n'existe généralement pas, et coller le lien soi-même est le
 *      geste naturel.
 *
 * Le lien pointe vers la page PUBLIQUE : le destinataire voit le défi avant même d'avoir un
 * compte, et n'est envoyé vers la connexion qu'au moment de rejoindre.
 *
 * `navigator.share` et `navigator.clipboard` exigent tous deux un contexte sécurisé (HTTPS ou
 * localhost). Hors de ce cas, on montre quand même le lien pour qu'il reste copiable à la main
 * plutôt que d'échouer en silence.
 */
export function BoutonPartageDefi({ defiId, className = '' }: { defiId: string; className?: string }) {
  const [lienVisible, setLienVisible] = useState<string | null>(null)

  const partager = async () => {
    // `window.location.origin` plutôt qu'une variable d'environnement : le lien doit pointer
    // vers l'hôte par lequel le joueur est réellement passé.
    const lien = `${window.location.origin}/defis/${defiId}`
    const donnees = {
      title: 'Un défi vous attend sur Défis en Ligne',
      text: 'Rejoignez ce défi : celui qui perd le match perd sa mise.',
      url: lien,
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(donnees)
        return
      } catch {
        // Feuille de partage refermée sans choisir, ou refus du navigateur : on retombe sur
        // la copie plutôt que de laisser le joueur sans rien.
      }
    }

    try {
      await navigator.clipboard.writeText(lien)
      toastSucces('Lien copié', 'Collez-le où vous voulez : la personne verra le défi et pourra le rejoindre.')
    } catch {
      setLienVisible(lien)
      toastInfo('Copie impossible', 'Le lien est affiché sous le bouton : sélectionnez-le pour le copier.')
    }
  }

  return (
    <>
      <Button variante="secondaire" onClick={() => void partager()} iconeDebut={icone.partage} className={className}>
        Partager le défi
      </Button>
      {lienVisible && (
        <p className="mt-2 break-all rounded-xl border border-trait bg-gris px-3 py-2 text-legende">{lienVisible}</p>
      )}
    </>
  )
}

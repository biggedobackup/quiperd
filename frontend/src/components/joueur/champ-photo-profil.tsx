import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { Button } from '@/components/partages/button/button'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

/** Formats acceptés par le backend pour une photo de profil, et plafond de taille. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic'
const TAILLE_MAX_MO = 3

/** Adresse de la photo d'un joueur, servie par le pont authentifié du site. */
export function urlPhotoProfil(utilisateurId: string, version?: string): string {
  const v = version ? `?v=${encodeURIComponent(version)}` : ''
  return `/api/utilisateurs/${utilisateurId}/photo${v}`
}

/**
 * Photo de profil : le joueur **envoie un fichier**, il ne colle pas une adresse.
 *
 * Coller un lien avait trois défauts : la photo pouvait disparaître du jour au lendemain,
 * le navigateur des autres joueurs allait chercher une ressource chez un tiers (traceur,
 * contenu quelconque), et rien ne garantissait que c'était une image. Le fichier est
 * désormais stocké par la plateforme et servi par une route qui exige une session.
 */
export function ChampPhotoProfil({ utilisateurId, photoActuelle }: { utilisateurId: string; photoActuelle: string }) {
  const champ = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [enCours, setEnCours] = useState(false)
  // Change à chaque envoi : sans cela le navigateur réafficherait l'ancienne image,
  // l'adresse étant identique.
  const [version, setVersion] = useState(() => photoActuelle)
  const [apercu, setApercu] = useState<string | null>(null)

  const aUnePhoto = Boolean(version)
  const source = apercu ?? (aUnePhoto ? urlPhotoProfil(utilisateurId, version) : null)

  async function envoyer(fichier: File) {
    if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
      toastErreur('Image trop lourde', `${TAILLE_MAX_MO} Mo maximum.`)
      return
    }
    setEnCours(true)
    // Aperçu immédiat : le joueur voit sa photo pendant que l'envoi se termine.
    const local = URL.createObjectURL(fichier)
    setApercu(local)
    try {
      const formulaire = new FormData()
      formulaire.append('fichier', fichier)
      const reponse = await fetch(urlPhotoProfil(utilisateurId), { method: 'POST', body: formulaire })
      const corps = await reponse.json().catch(() => null)
      if (!reponse.ok) {
        setApercu(null)
        toastErreur('Envoi impossible', corps?.erreur ?? 'Réessayez dans un instant.')
        return
      }
      setVersion(String(corps?.photoProfil ?? Date.now()))
      setApercu(null)
      await queryClient.invalidateQueries({ queryKey: cles.session })
      toastSucces('Photo mise à jour')
    } finally {
      URL.revokeObjectURL(local)
      setEnCours(false)
      if (champ.current) champ.current.value = ''
    }
  }

  async function retirer() {
    setEnCours(true)
    try {
      const reponse = await fetch(urlPhotoProfil(utilisateurId), { method: 'DELETE' })
      if (!reponse.ok) {
        toastErreur('Suppression impossible', 'Réessayez dans un instant.')
        return
      }
      setVersion('')
      setApercu(null)
      await queryClient.invalidateQueries({ queryKey: cles.session })
      toastSucces('Photo retirée')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="etiquette text-muet">Photo de profil</span>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden border-2 border-trait bg-gris">
          {source ? (
            <img src={source} alt="Votre photo de profil" className="size-full object-cover" />
          ) : (
            <FontAwesomeIcon icon={icone.profil} className="text-muet" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <label className="etiquette flex min-h-11 cursor-pointer items-center gap-2 border-2 border-trait bg-gris px-3.5 transition-colors duration-150 hover:border-vert">
            <FontAwesomeIcon icon={icone.televerser} className="text-muet" />
            {aUnePhoto ? 'Changer la photo' : 'Choisir une photo'}
            <input
              ref={champ}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={enCours}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void envoyer(f)
              }}
            />
          </label>
          {aUnePhoto && (
            <Button variante="fantome" onClick={retirer} disabled={enCours} iconeDebut={icone.supprimer}>
              Retirer
            </Button>
          )}
        </div>
      </div>
      <p className="text-legende text-muet">JPG, PNG, WEBP ou HEIC, {TAILLE_MAX_MO} Mo maximum. Elle est stockée par la plateforme, jamais chargée depuis un autre site.</p>
    </div>
  )
}

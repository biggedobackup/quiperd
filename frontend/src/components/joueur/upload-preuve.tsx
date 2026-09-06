import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import type { TypePreuve } from '@/models/preuve-match'
import { Button } from '@/components/partages/button/button'
import { Select } from '@/components/partages/select/select'
import { BarreProgressionUpload } from '@/components/partages/barre-progression-upload/barre-progression-upload'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const ACCEPT: Record<TypePreuve, string> = {
  capture_ecran: '.jpg,.jpeg,.png,.webp,.heic,image/*',
  video: '.mp4,.mov,.webm,.mkv,video/*',
}
const TAILLE_MAX_MO = 50

/**
 * Envoi d'une preuve en XMLHttpRequest vers la route serveur (progression réelle), puis
 * rafraîchissement de la liste. Le fichier part tel quel : le backend contrôle le format.
 */
export function UploadPreuve({ matchId, onEnvoye }: { matchId: string; onEnvoye: () => void }) {
  const [type, setType] = useState<TypePreuve>('capture_ecran')
  const [fichier, setFichier] = useState<File | null>(null)
  const [progression, setProgression] = useState<number | null>(null)
  const champ = useRef<HTMLInputElement>(null)

  const envoyer = () => {
    if (!fichier) return
    if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
      toastErreur('Fichier trop volumineux', `Limite : ${TAILLE_MAX_MO} Mo.`)
      return
    }
    const donnees = new FormData()
    donnees.set('type', type)
    donnees.set('fichier', fichier)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/matchs/${matchId}/preuves`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgression((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      setProgression(null)
      let corps: { erreur?: string } = {}
      try {
        corps = JSON.parse(xhr.responseText) as { erreur?: string }
      } catch {
        // réponse vide
      }
      if (xhr.status === 201) {
        toastSucces('Preuve envoyée', type === 'video' ? 'Vidéo enregistrée, en attente de vérification.' : 'Capture enregistrée, en attente de vérification.')
        setFichier(null)
        if (champ.current) champ.current.value = ''
        onEnvoye()
      } else {
        toastErreur('Envoi refusé', corps.erreur ?? `Erreur ${xhr.status}`)
      }
    }
    xhr.onerror = () => {
      setProgression(null)
      toastErreur('Envoi impossible', 'Vérifiez votre connexion puis réessayez.')
    }
    setProgression(0)
    xhr.send(donnees)
  }

  return (
    <div className="ticket-sm border-2 border-dashed border-encre bg-papier p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <Select
          label="Type de preuve"
          options={[
            { valeur: 'capture_ecran', libelle: 'Capture d’écran' },
            { valeur: 'video', libelle: 'Vidéo' },
          ]}
          value={type}
          onChange={(e) => {
            setType(e.target.value as TypePreuve)
            setFichier(null)
            if (champ.current) champ.current.value = ''
          }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="etiquette text-muet">Fichier</span>
          <label className="flex h-11 cursor-pointer items-center gap-3 border-2 border-trait bg-gris px-3 text-legende transition-colors hover:border-encre">
            <FontAwesomeIcon icon={type === 'video' ? icone.video : icone.preuve} className="text-muet" />
            <span className="truncate">{fichier ? `${fichier.name} · ${(fichier.size / 1024 / 1024).toFixed(1)} Mo` : 'Choisir un fichier…'}</span>
            <input ref={champ} type="file" accept={ACCEPT[type]} className="sr-only" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Button variante="primaire" onClick={envoyer} disabled={!fichier || progression !== null} chargement={progression !== null} iconeDebut={icone.televerser}>
          Envoyer
        </Button>
      </div>
      {progression !== null && <BarreProgressionUpload pourcentage={progression} className="mt-4" />}
      <p className="mt-3 text-[12px] text-muet">Capture (jpg, png, webp, heic) ou vidéo (mp4, mov, webm, mkv), {TAILLE_MAX_MO} Mo max. Une preuve déjà utilisée pour un autre match est refusée.</p>
    </div>
  )
}

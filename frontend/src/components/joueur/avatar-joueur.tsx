import { urlPhotoProfil } from '@/components/joueur/champ-photo-profil'

/**
 * Pastille d'un joueur : sa photo de profil s'il en a une, ses initiales sinon.
 *
 * Sert partout où l'on nomme un adversaire — carte de match, écran de match — pour qu'on
 * voie **à qui** on joue et pas seulement un pseudo. La pastille garde exactement la même
 * taille dans les deux cas : la mise en page ne saute pas quand l'image arrive, et une
 * photo qui ne charge pas (session expirée, fichier retiré) laisse simplement le fond vert.
 *
 * `photo` est le chemin renvoyé par l'API (`joueur1Photo` / `joueur2Photo`). Il ne sert pas
 * d'adresse — le fichier est servi par une route protégée — mais de deux indices : vide = pas
 * de photo, et sa valeur sert de version pour le cache du navigateur.
 */
export function AvatarJoueur({
  utilisateurId,
  nom,
  photo,
  taille = 36,
  className = '',
}: {
  utilisateurId: string
  nom: string
  /** Chemin stocké de la photo. Vide ou absent → initiales. */
  photo?: string
  /** Diamètre en pixels. */
  taille?: number
  className?: string
}) {
  const style = { width: taille, height: taille }
  const commun = `shrink-0 rounded-full object-cover ${className}`

  if (photo) {
    return (
      <img
        src={urlPhotoProfil(utilisateurId, photo)}
        // Décoratif : le pseudo est écrit juste à côté, le répéter ici ferait doublon
        // pour un lecteur d'écran.
        alt=""
        style={style}
        className={`${commun} bg-gris`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(taille * 0.36) }}
      className={`chiffres flex items-center justify-center bg-vert font-bold uppercase text-craie ${commun}`}
    >
      {nom.slice(0, 2)}
    </span>
  )
}

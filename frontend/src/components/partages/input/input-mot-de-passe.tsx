import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { Input, type ProprietesInput } from './input'

export type ProprietesInputMotDePasse = Omit<ProprietesInput, 'type' | 'suffixe'>

/**
 * Champ mot de passe avec bouton « Voir / Masquer » — à utiliser pour TOUS les mots de passe
 * (connexion joueur et admin, inscription, réinitialisation, changement dans le profil,
 * création d'utilisateur par l'admin). Compatible `register()` de react-hook-form via `ref`.
 */
export function InputMotDePasse({ iconeDebut = icone.cadenas, autoComplete = 'current-password', ...reste }: ProprietesInputMotDePasse) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      type={visible ? 'text' : 'password'}
      iconeDebut={iconeDebut}
      autoComplete={autoComplete}
      suffixe={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="pointer-events-auto flex h-11 min-w-11 items-center justify-center gap-1.5 px-2 font-sans text-legende font-semibold text-muet transition-colors hover:text-encre"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
        >
          <FontAwesomeIcon icon={visible ? icone.masquer : icone.voir} />
          {visible ? 'Masquer' : 'Voir'}
        </button>
      }
      {...reste}
    />
  )
}

import { useQuery } from '@tanstack/react-query'
import { formatIdentifiant } from '@/lib/format'
import { optionsUtilisateur } from '@/lib/requetes'

/**
 * Pseudo d'un joueur à partir de son identifiant (détail admin `GET /api/utilisateurs/:id`, mis en
 * cache par identifiant et préchargé par les loaders des listes paginées) ; identifiant abrégé en repli.
 */
export function NomUtilisateur({ id, className = '' }: { id: string; className?: string }) {
  const { data, isPending } = useQuery(optionsUtilisateur(id))
  if (data) return <span className={className}>{data.nomUtilisateur}</span>
  return (
    <span className={`chiffres ${className}`} title={id}>
      {isPending ? '…' : formatIdentifiant(id)}
    </span>
  )
}

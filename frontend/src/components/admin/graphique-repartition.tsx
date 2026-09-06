import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMontant } from '@/lib/format'

export interface Barre {
  nom: string
  valeur: number
  /** Couleur de la barre (token CSS). */
  couleur?: string
}

/**
 * Répartition en barres plates (Recharts) : rendu côté client uniquement (ResponsiveContainer
 * n'a pas de largeur au SSR). Aucune série temporelle inventée : le backend n'en expose pas.
 */
export function GraphiqueRepartition({ titre, donnees, format = 'entier', hauteur = 220 }: { titre: string; donnees: Barre[]; format?: 'entier' | 'montant'; hauteur?: number }) {
  const [monte, setMonte] = useState(false)
  useEffect(() => setMonte(true), [])
  const formate = (v: number) => (format === 'montant' ? formatMontant(v) : String(v))

  return (
    <div className="ticket-sm border-2 border-encre bg-papier p-5">
      <h3 className="etiquette text-muet">{titre}</h3>
      <div className="mt-4" style={{ height: hauteur }}>
        {monte ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={donnees} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--color-trait)" />
              <XAxis dataKey="nom" tick={{ fontSize: 11, fill: 'var(--color-muet)', fontFamily: 'var(--font-texte)' }} axisLine={{ stroke: 'var(--color-encre)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-muet)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={format === 'montant' ? 64 : 32} tickFormatter={(v: number) => (format === 'montant' ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip
                cursor={{ fill: 'var(--color-volt-fond)' }}
                contentStyle={{ border: '2px solid var(--color-encre)', borderRadius: 0, background: 'var(--color-papier)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-encre)' }}
                formatter={(v) => [formate(Number(v)), '']}
                labelStyle={{ fontFamily: 'var(--font-texte)', fontWeight: 700 }}
              />
              <Bar dataKey="valeur" fill="var(--color-encre)" radius={0} isAnimationActive />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full animate-pulsation bg-trait/40" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

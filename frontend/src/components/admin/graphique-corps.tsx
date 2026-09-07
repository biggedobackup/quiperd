import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMontant } from '@/lib/format'
import type { ProprietesGraphique } from './graphique-repartition'

/**
 * Corps du graphique — **module chargé à la demande**. Recharts pèse plus de 350 Ko :
 * l'importer depuis la page ferait payer ce poids à chaque ouverture du tableau de bord,
 * y compris avant que le moindre pixel de graphique soit visible. Voir
 * `graphique-repartition.tsx` pour l'enveloppe qui le charge.
 */
export default function GraphiqueCorps({ donnees, format = 'entier' }: Pick<ProprietesGraphique, 'donnees' | 'format'>) {
  const formate = (v: number) => (format === 'montant' ? formatMontant(v) : String(v))

  return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={donnees} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--color-trait)" />
              <XAxis dataKey="nom" tick={{ fontSize: 11, fill: 'var(--color-muet)', fontFamily: 'var(--font-texte)' }} axisLine={{ stroke: 'var(--color-trait)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-muet)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={format === 'montant' ? 64 : 32} tickFormatter={(v: number) => (format === 'montant' ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip
                cursor={{ fill: 'var(--color-vert-pale)' }}
                contentStyle={{ border: '1px solid var(--color-trait)', borderRadius: 12, boxShadow: 'var(--shadow-carte)', background: 'var(--color-papier)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-encre)' }}
                formatter={(v) => [formate(Number(v)), '']}
                labelStyle={{ fontFamily: 'var(--font-texte)', fontWeight: 700 }}
              />
              <Bar dataKey="valeur" fill="var(--color-encre)" radius={[6, 6, 0, 0]} isAnimationActive />
            </BarChart>
          </ResponsiveContainer>
  )
}

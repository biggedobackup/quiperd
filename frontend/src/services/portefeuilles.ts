/** Module `portefeuilles` — solde disponible/bloqué et historique des mouvements. */
import { createServerFn } from '@tanstack/react-start'
import { requete } from '@/server/http-client'
import { appelJoueur } from '@/server/session'
import type { Portefeuille } from '@/models/portefeuille'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'

export const lirePortefeuille = createServerFn({ method: 'GET' }).handler(async () =>
  appelJoueur<Portefeuille>('/portefeuille'),
)

export const listerTransactions = createServerFn({ method: 'GET' })
  .inputValidator((d: { limite?: number; decalage?: number } = {}) => d)
  .handler(async ({ data }) =>
    appelJoueur<TransactionPortefeuille[]>(
      `/portefeuille/transactions${requete({ limite: data.limite ?? 20, decalage: data.decalage ?? 0 })}`,
    ),
  )

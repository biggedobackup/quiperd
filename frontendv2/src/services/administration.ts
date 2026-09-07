/** Module `administration` — statistiques, configurations financières, journal d'audit. */
import { createServerFn } from '@tanstack/react-start'
import { ErreurApi, appelBackend, enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin } from '@/server/session'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'
import type {
  ConfigurationFinanciere,
  ConfigurationPublique,
  JournalAudit,
  ReglesFinancieres,
  Statistiques,
  TypeConfiguration,
} from '@/models/administration'
import { versNombre } from '@/lib/format'

export const lireStatistiques = createServerFn({ method: 'GET' }).handler(async () =>
  appelAdmin<Statistiques>('/administration/statistiques'),
)

export const listerConfigurations = createServerFn({ method: 'GET' }).handler(async () =>
  appelAdmin<ConfigurationFinanciere[]>('/administration/configurations-financieres'),
)

export const modifierConfiguration = createServerFn({ method: 'POST' })
  .inputValidator((d: { type: TypeConfiguration; valeur: number }) => d)
  .handler(async ({ data }): Promise<Resultat<ConfigurationFinanciere>> =>
    enResultat(
      appelAdmin<ConfigurationFinanciere>('/administration/configurations-financieres', {
        methode: 'PATCH',
        corps: data,
      }),
    ),
  )

/**
 * Journal d'audit paginé (`?page=&taille=10`, trié par date décroissante). Route documentée dans
 * `demarrage-backend.md` : `/administration/journaux-audit` ; repli sur l'alias `/journal-audit` si 404.
 */
export const listerJournalAudit = createServerFn({ method: 'GET' })
  .inputValidator((d: { action?: string; page?: number } = {}) => d)
  .handler(async ({ data }) => {
    const q = requete({ action: data.action, page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN })
    try {
      return await appelAdmin<Page<JournalAudit>>(`/administration/journaux-audit${q}`)
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) return appelAdmin<Page<JournalAudit>>(`/journal-audit${q}`)
      throw e
    }
  })

/** Public : règles financières actives, jamais codées en dur côté client. */
export const lireReglesFinancieres = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ReglesFinancieres> => {
    const liste = await appelBackend<ConfigurationPublique[]>('/configurations-financieres')
    const valeur = (type: TypeConfiguration) => versNombre(liste.find((c) => c.type === type)?.valeur)
    return {
      commissionDefi: valeur('commission_defi'),
      miseMinimale: valeur('mise_minimale'),
      miseMaximale: valeur('mise_maximale'),
      fraisRetrait: valeur('frais_retrait'),
    }
  },
)

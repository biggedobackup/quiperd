/**
 * Liste des pays proposés à l'inscription et dans l'administration (valeur stockée : le nom
 * français, tel qu'affiché dans les listes admin). L'indicatif sert d'aide de saisie du
 * téléphone — le numéro n'est pas forcément un compte mobile money.
 */
import type { GroupeOptions, OptionSelect } from '@/components/partages/select/select'

export interface Pays {
  code: string
  nom: string
  indicatif: string
}

export const PAYS: readonly Pays[] = [
  { code: 'CI', nom: "Côte d'Ivoire", indicatif: '+225' },
  { code: 'SN', nom: 'Sénégal', indicatif: '+221' },
  { code: 'ML', nom: 'Mali', indicatif: '+223' },
  { code: 'BF', nom: 'Burkina Faso', indicatif: '+226' },
  { code: 'TG', nom: 'Togo', indicatif: '+228' },
  { code: 'BJ', nom: 'Bénin', indicatif: '+229' },
  { code: 'NE', nom: 'Niger', indicatif: '+227' },
  { code: 'GN', nom: 'Guinée', indicatif: '+224' },
  { code: 'GW', nom: 'Guinée-Bissau', indicatif: '+245' },
  { code: 'MR', nom: 'Mauritanie', indicatif: '+222' },
  { code: 'GM', nom: 'Gambie', indicatif: '+220' },
  { code: 'SL', nom: 'Sierra Leone', indicatif: '+232' },
  { code: 'LR', nom: 'Liberia', indicatif: '+231' },
  { code: 'GH', nom: 'Ghana', indicatif: '+233' },
  { code: 'NG', nom: 'Nigeria', indicatif: '+234' },
  { code: 'CM', nom: 'Cameroun', indicatif: '+237' },
  { code: 'GA', nom: 'Gabon', indicatif: '+241' },
  { code: 'CG', nom: 'Congo', indicatif: '+242' },
  { code: 'CD', nom: 'RD Congo', indicatif: '+243' },
  { code: 'CF', nom: 'Centrafrique', indicatif: '+236' },
  { code: 'TD', nom: 'Tchad', indicatif: '+235' },
  { code: 'GQ', nom: 'Guinée équatoriale', indicatif: '+240' },
  { code: 'MA', nom: 'Maroc', indicatif: '+212' },
  { code: 'DZ', nom: 'Algérie', indicatif: '+213' },
  { code: 'TN', nom: 'Tunisie', indicatif: '+216' },
  { code: 'EG', nom: 'Égypte', indicatif: '+20' },
  { code: 'KE', nom: 'Kenya', indicatif: '+254' },
  { code: 'ET', nom: 'Éthiopie', indicatif: '+251' },
  { code: 'TZ', nom: 'Tanzanie', indicatif: '+255' },
  { code: 'UG', nom: 'Ouganda', indicatif: '+256' },
  { code: 'RW', nom: 'Rwanda', indicatif: '+250' },
  { code: 'BI', nom: 'Burundi', indicatif: '+257' },
  { code: 'MG', nom: 'Madagascar', indicatif: '+261' },
  { code: 'MU', nom: 'Maurice', indicatif: '+230' },
  { code: 'ZA', nom: 'Afrique du Sud', indicatif: '+27' },
  { code: 'AO', nom: 'Angola', indicatif: '+244' },
  { code: 'MZ', nom: 'Mozambique', indicatif: '+258' },
  { code: 'ZM', nom: 'Zambie', indicatif: '+260' },
  { code: 'FR', nom: 'France', indicatif: '+33' },
  { code: 'BE', nom: 'Belgique', indicatif: '+32' },
  { code: 'CH', nom: 'Suisse', indicatif: '+41' },
  { code: 'GB', nom: 'Royaume-Uni', indicatif: '+44' },
  { code: 'DE', nom: 'Allemagne', indicatif: '+49' },
  { code: 'ES', nom: 'Espagne', indicatif: '+34' },
  { code: 'IT', nom: 'Italie', indicatif: '+39' },
  { code: 'PT', nom: 'Portugal', indicatif: '+351' },
  { code: 'CA', nom: 'Canada', indicatif: '+1' },
  { code: 'US', nom: 'États-Unis', indicatif: '+1' },
  { code: 'BR', nom: 'Brésil', indicatif: '+55' },
  { code: 'AE', nom: 'Émirats arabes unis', indicatif: '+971' },
  { code: 'TR', nom: 'Turquie', indicatif: '+90' },
  { code: 'IN', nom: 'Inde', indicatif: '+91' },
  { code: 'CN', nom: 'Chine', indicatif: '+86' },
]

/** Pays proposés en tête de liste (marché principal). */
const FREQUENTS = ['CI', 'SN', 'ML', 'BF', 'TG', 'BJ', 'CM', 'GN']

const parNom = (a: Pays, b: Pays) => a.nom.localeCompare(b.nom, 'fr')

/** Groupes `<optgroup>` : pays fréquents puis tous les pays par ordre alphabétique. */
export function optionsPaysGroupees(): GroupeOptions[] {
  const frequents = FREQUENTS.map((code) => PAYS.find((p) => p.code === code)).filter((p): p is Pays => p !== undefined)
  const tous = [...PAYS].sort(parNom)
  const enOption = (p: Pays): OptionSelect => ({ valeur: p.nom, libelle: `${p.nom} (${p.indicatif})` })
  return [
    { libelle: 'Pays fréquents', options: frequents.map(enOption) },
    { libelle: 'Tous les pays', options: tous.map(enOption) },
  ]
}

/** Retrouve un pays par nom (valeur stockée) ou par code ISO. */
export function trouverPays(valeur: string | null | undefined): Pays | undefined {
  if (!valeur) return undefined
  const v = valeur.trim().toLowerCase()
  return PAYS.find((p) => p.nom.toLowerCase() === v || p.code.toLowerCase() === v)
}

/** Indicatif téléphonique du pays (ou chaîne vide si inconnu). */
export function indicatifPays(valeur: string | null | undefined): string {
  return trouverPays(valeur)?.indicatif ?? ''
}

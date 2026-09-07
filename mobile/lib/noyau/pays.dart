/// Pays proposés à l'inscription et au profil — transcription de
/// `frontend/src/lib/pays.ts`. La valeur STOCKÉE est le nom français, exactement
/// comme sur le web : les deux clients écrivent la même chose en base.
///
/// L'indicatif ne sert qu'à préremplir la saisie du téléphone ; le numéro n'est
/// pas forcément un compte Mobile Money.
class Pays {
  const Pays(this.code, this.nom, this.indicatif);
  final String code;
  final String nom;
  final String indicatif;
}

const List<Pays> paysConnus = [
  Pays('CI', "Côte d'Ivoire", '+225'),
  Pays('SN', 'Sénégal', '+221'),
  Pays('ML', 'Mali', '+223'),
  Pays('BF', 'Burkina Faso', '+226'),
  Pays('TG', 'Togo', '+228'),
  Pays('BJ', 'Bénin', '+229'),
  Pays('NE', 'Niger', '+227'),
  Pays('GN', 'Guinée', '+224'),
  Pays('GW', 'Guinée-Bissau', '+245'),
  Pays('MR', 'Mauritanie', '+222'),
  Pays('GM', 'Gambie', '+220'),
  Pays('SL', 'Sierra Leone', '+232'),
  Pays('LR', 'Liberia', '+231'),
  Pays('GH', 'Ghana', '+233'),
  Pays('NG', 'Nigeria', '+234'),
  Pays('CM', 'Cameroun', '+237'),
  Pays('GA', 'Gabon', '+241'),
  Pays('CG', 'Congo', '+242'),
  Pays('CD', 'RD Congo', '+243'),
  Pays('CF', 'Centrafrique', '+236'),
  Pays('TD', 'Tchad', '+235'),
  Pays('GQ', 'Guinée équatoriale', '+240'),
  Pays('MA', 'Maroc', '+212'),
  Pays('DZ', 'Algérie', '+213'),
  Pays('TN', 'Tunisie', '+216'),
  Pays('EG', 'Égypte', '+20'),
  Pays('KE', 'Kenya', '+254'),
  Pays('ET', 'Éthiopie', '+251'),
  Pays('TZ', 'Tanzanie', '+255'),
  Pays('UG', 'Ouganda', '+256'),
  Pays('RW', 'Rwanda', '+250'),
  Pays('BI', 'Burundi', '+257'),
  Pays('MG', 'Madagascar', '+261'),
  Pays('MU', 'Maurice', '+230'),
  Pays('ZA', 'Afrique du Sud', '+27'),
  Pays('AO', 'Angola', '+244'),
  Pays('MZ', 'Mozambique', '+258'),
  Pays('ZM', 'Zambie', '+260'),
  Pays('FR', 'France', '+33'),
  Pays('BE', 'Belgique', '+32'),
  Pays('CH', 'Suisse', '+41'),
  Pays('GB', 'Royaume-Uni', '+44'),
  Pays('DE', 'Allemagne', '+49'),
  Pays('ES', 'Espagne', '+34'),
  Pays('IT', 'Italie', '+39'),
  Pays('PT', 'Portugal', '+351'),
  Pays('CA', 'Canada', '+1'),
  Pays('US', 'États-Unis', '+1'),
  Pays('BR', 'Brésil', '+55'),
  Pays('AE', 'Émirats arabes unis', '+971'),
  Pays('TR', 'Turquie', '+90'),
  Pays('IN', 'Inde', '+91'),
  Pays('CN', 'Chine', '+86'),
];

/// Pays proposés en tête de liste (marché principal).
const List<String> _frequents = ['CI', 'SN', 'ML', 'BF', 'TG', 'BJ', 'CM', 'GN'];

List<Pays> get paysFrequents => _frequents
    .map((code) => paysConnus.where((p) => p.code == code).firstOrNull)
    .whereType<Pays>()
    .toList(growable: false);

List<Pays> get paysParNom {
  final tous = [...paysConnus]..sort((a, b) => a.nom.compareTo(b.nom));
  return tous;
}

/// Retrouve un pays par nom (valeur stockée) ou par code ISO.
Pays? trouverPays(String? valeur) {
  if (valeur == null || valeur.trim().isEmpty) return null;
  final v = valeur.trim().toLowerCase();
  return paysConnus
      .where((p) => p.nom.toLowerCase() == v || p.code.toLowerCase() == v)
      .firstOrNull;
}

/// Indicatif téléphonique du pays, ou chaîne vide s'il est inconnu.
String indicatifPays(String? valeur) => trouverPays(valeur)?.indicatif ?? '';

extension _Premier<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}

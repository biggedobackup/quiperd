/// Liens profonds : un lien de défi partagé ouvre l'application sur le défi.
///
/// Deux formes reconnues, celles que déclare `AndroidManifest.xml` :
///   - `https://<site>/defis/<id>`  — le lien qui circule dans une conversation ;
///   - `defisenligne://defis/<id>`       — schéma propre, sans vérification de domaine.
///
/// Le rôle de ce fichier s'arrête à **lire un identifiant** dans une URL. Il ne navigue pas,
/// ne connaît pas les écrans, et ne dépend d'aucun état : c'est ce qui le rend testable et
/// réutilisable si d'autres liens profonds arrivent un jour (un match, un litige).
library;

/// Identifiant du défi visé par [uri], ou `null` si ce n'est pas un lien de défi.
///
/// Accepte indifféremment `https://site/defis/<id>` (segments `defis`, `<id>`) et
/// `defisenligne://defis/<id>` (hôte `defis`, segment `<id>`). Tolère une barre finale et des
/// paramètres de requête — un lien recopié à la main en traîne souvent.
String? defiIdDepuis(Uri uri) {
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();

  // Schéma propre : l'identifiant est le premier segment, « defis » est l'hôte.
  if (uri.scheme == 'defisenligne') {
    if (uri.host != 'defis' || segments.isEmpty) return null;
    return _valide(segments.first);
  }

  // Lien web : on cherche le couple « defis / <id> », où qu'il soit dans le chemin — le site
  // pourrait être servi sous un préfixe.
  final i = segments.indexOf('defis');
  if (i < 0 || i + 1 >= segments.length) return null;
  return _valide(segments[i + 1]);
}

/// N'accepte qu'un UUID : le reste (`/defis/nouveau`, `/defis/ouverts`) n'est pas un défi, et
/// pousser un écran de détail sur un identifiant inventé n'afficherait qu'une erreur.
String? _valide(String candidat) {
  final id = candidat.trim();
  final uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );
  return uuid.hasMatch(id) ? id : null;
}

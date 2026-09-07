import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:quiperd/composants/communs/badge_statut.dart';
import 'package:quiperd/composants/communs/liste_deroulante.dart';
import 'package:quiperd/composants/joueur/compte_a_rebours.dart';
import 'package:quiperd/composants/joueur/feuilles/depot.feuille.dart';
import 'package:quiperd/composants/joueur/tableau_score.dart';
import 'package:quiperd/modeles/match_defi.modele.dart';
import 'package:quiperd/modeles/paiement.modele.dart';
import 'package:quiperd/noyau/format.dart';
import 'package:quiperd/noyau/statuts.dart';

/// Tests des points où une erreur coûterait de l'argent au joueur ou lui
/// mentirait sur l'état de son match : formatage des montants, lecture des
/// montants décimaux du backend, libellés de statut et affichage du score.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('fr_FR');
  });

  group('Montants', () {
    test('les chaînes décimales du backend sont lues sans perte', () {
      expect(versNombre('2000'), 2000);
      expect(versNombre('1750.50'), 1750.5);
      expect(versNombre(''), 0);
      expect(versNombre(null), 0);
    });

    test('XOF s’affiche en FCFA, les entiers sans décimales', () {
      expect(formatMontant('2000'), contains('FCFA'));
      expect(formatMontant('2000'), isNot(contains(',00')));
      // `intl` sépare les milliers par une espace insécable étroite (U+202F) :
      // on la normalise plutôt que de la coder en dur dans l'attendu.
      final precis = formatMontant('1750.50').replaceAll(RegExp(r'\s'), ' ');
      expect(precis, '1 750,5 FCFA');
      final rond = formatMontant('2000').replaceAll(RegExp(r'\s'), ' ');
      expect(rond, '2 000 FCFA');
    });

    test('le signe distingue un crédit d’un débit', () {
      expect(formatMontantSigne('3600', SensMontant.credit), startsWith('+'));
      expect(formatMontantSigne('2000', SensMontant.debit), startsWith('−'));
      expect(formatMontantSigne('500', SensMontant.neutre), startsWith('5'));
    });

    test('le taux de commission s’affiche en pourcentage', () {
      expect(formatPourcentage(0.1), '10 %');
      expect(formatPourcentage(0.025), '2,5 %');
    });
  });

  group('Durées', () {
    test('une échéance dépassée n’affiche jamais un temps négatif', () {
      expect(formatDuree(const Duration(seconds: -30)), 'échu');
      expect(formatDuree(Duration.zero), 'échu');
    });

    test('le format change avec l’ordre de grandeur', () {
      expect(formatDuree(const Duration(minutes: 4, seconds: 5)), '04:05');
      expect(formatDuree(const Duration(hours: 2, minutes: 7)), '2 h 07 min');
      expect(formatDuree(const Duration(days: 1, hours: 3)), '1 j 03 h');
    });
  });

  group('Statuts', () {
    test('chaque statut de match a un libellé lisible', () {
      for (final valeur in [
        'en_cours',
        'preuve_requise',
        'nul_en_attente',
        'litige',
        'termine',
      ]) {
        final description = decrireStatut(FamilleStatut.match, valeur);
        expect(description.libelle, isNotEmpty);
        expect(description.libelle, isNot(contains('_')));
      }
    });

    test('un statut inconnu ne casse pas l’affichage', () {
      expect(decrireStatut(FamilleStatut.match, 'inedit').libelle, 'inedit');
    });
  });

  group('Modèle de match', () {
    final match = MatchDefi.depuisJson(const {
      'id': 'm1',
      'joueur1Id': 'a',
      'joueur2Id': 'b',
      'joueur1Nom': 'Kader',
      'joueur2Nom': 'Moussa',
      'montantMise': '2000',
      'statut': 'en_cours',
    });

    test('la manche vaut 1 quand le backend ne l’envoie pas', () {
      expect(match.manche, 1);
    });

    test('l’adversaire est déduit du bon côté', () {
      expect(match.adversaireDe('a'), 'b');
      expect(match.nomAdversaireDe('a'), 'Moussa');
      expect(match.nomDe('a'), 'Kader');
      expect(match.estParticipant('c'), isFalse);
    });

    test('le montant reste une chaîne décimale, jamais un double', () {
      expect(match.montantMise, isA<String>());
      expect(match.montantMise, '2000');
    });
  });

  testWidgets('le badge affiche le libellé du statut, pas sa valeur brute',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: BadgeStatut(famille: FamilleStatut.match, valeur: 'preuve_requise'),
      ),
    ));
    expect(find.text('PREUVE EXIGÉE'), findsOneWidget);
  });

  testWidgets('le tableau de score montre un tiret tant qu’aucun score n’existe',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: TableauScore(joueur1: 'Kader', joueur2: 'Moussa', score1: null, score2: null),
      ),
    ));
    expect(find.text('–'), findsNWidgets(2));
    expect(find.text('KADER'), findsOneWidget);
  });

  testWidgets('une liste groupée survit à une valeur présente dans deux groupes',
      (WidgetTester tester) async {
    // Cas réel : « Côte d'Ivoire » figure à la fois dans « Pays fréquents » et
    // dans « Tous les pays ». `DropdownButton` exige une valeur unique, sinon
    // l'écran devient rouge.
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ListeDeroulante(
          label: 'Pays',
          valeur: "Côte d'Ivoire",
          onChanged: (_) {},
          groupes: const [
            GroupeOptions('Pays fréquents', [OptionListe("Côte d'Ivoire", "Côte d'Ivoire")]),
            GroupeOptions('Tous les pays', [
              OptionListe("Côte d'Ivoire", "Côte d'Ivoire"),
              OptionListe('Sénégal', 'Sénégal'),
            ]),
          ],
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
    expect(find.text("Côte d'Ivoire"), findsOneWidget);
  });

  testWidgets('le compte à rebours signale la fin une seule fois',
      (WidgetTester tester) async {
    var fins = 0;
    final echeance = DateTime.now().toUtc().add(const Duration(seconds: 1)).toIso8601String();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: CompteARebours(echeance: echeance, surFin: () => fins++),
      ),
    ));
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));

    expect(fins, 1);
    expect(find.text('échu'), findsOneWidget);
  });

  group('Feuille de dépôt', () {
    /// Ouvre la feuille comme le fait l'écran du portefeuille.
    Future<void> ouvrir(WidgetTester tester, List<PrestatairePublic> prestataires) async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => ouvrirDepot(context, prestataires: prestataires),
                child: const Text('ouvrir'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
    }

    testWidgets('sans passerelle configurée, aucun formulaire n’est proposé',
        (WidgetTester tester) async {
      // Le backend refuse un prestataire non configuré : proposer le formulaire
      // reviendrait à envoyer le joueur droit sur un 400 incompréhensible.
      await ouvrir(tester, const []);
      expect(find.textContaining('Aucun moyen de paiement'), findsOneWidget);
      expect(find.text('MONTANT'), findsNothing);
    });

    testWidgets('une seule passerelle : pas de liste déroulante à un choix',
        (WidgetTester tester) async {
      await ouvrir(tester, const [
        PrestatairePublic(code: 'fusionmoney', libelle: 'MoneyFusion', numeroRequis: true, montantMinimum: 200),
      ]);
      expect(find.text('Paiement via MoneyFusion.'), findsOneWidget);
      expect(find.text('PRESTATAIRE'), findsNothing);
      // `numeroRequis` vient du serveur : le champ n'est pas annoncé comme optionnel.
      expect(find.text('NUMÉRO MOBILE MONEY'), findsOneWidget);
      expect(find.text('NUMÉRO MOBILE MONEY (OPTIONNEL)'), findsNothing);
    });

    testWidgets('deux passerelles : le choix est rendu au joueur',
        (WidgetTester tester) async {
      await ouvrir(tester, const [
        PrestatairePublic(code: 'ligdicash', libelle: 'LigdiCash', numeroRequis: false, montantMinimum: 100),
        PrestatairePublic(code: 'fusionmoney', libelle: 'MoneyFusion', numeroRequis: true, montantMinimum: 200),
      ]);
      expect(find.text('PRESTATAIRE'), findsOneWidget);
      // Premier de la liste : LigdiCash, qui collecte le numéro sur sa propre page.
      expect(find.text('NUMÉRO MOBILE MONEY (OPTIONNEL)'), findsOneWidget);
    });
  });
}

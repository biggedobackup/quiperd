import 'conversion.dart';
import 'choix_nul.modele.dart';
import 'resultat_declare.modele.dart';

/// Table `matchs` (§7.6), enrichie des libellés (joueurs, jeu, plateforme).
///
/// La classe s'appelle `MatchDefi` et **jamais** `Match` : `Match` est déjà le
/// type des correspondances d'expressions régulières de `dart:core`.
///
/// Machine à états (miroir de `backend/matchs/models.go`) :
///
///   en_cours ──(1re déclaration)──► en_cours + échéance de confirmation
///      ├─ confirmation / déclaration identique ─► termine (règlement immédiat)
///      ├─ déclarations divergentes ────────────► preuve_requise ─► litige ─► termine
///      ├─ nul déclaré des deux côtés ──────────► nul_en_attente ─► en_cours (manche+1) | termine
///      └─ échéance dépassée ───────────────────► termine (victoire au déclarant)
class MatchDefi {
  const MatchDefi({
    required this.id,
    required this.dateCreation,
    required this.defiId,
    required this.joueur1Id,
    required this.joueur2Id,
    required this.scoreJoueur1,
    required this.scoreJoueur2,
    required this.gagnantId,
    required this.perdantId,
    required this.montantMise,
    required this.devise,
    required this.statut,
    required this.manche,
    required this.echeance,
    required this.echeanceType,
    required this.dateDebut,
    required this.dateFin,
    required this.joueur1Nom,
    required this.joueur2Nom,
    required this.jeuNom,
    required this.plateformeNom,
  });

  final String id;
  final String dateCreation;
  final String defiId;
  final String joueur1Id;
  final String joueur2Id;
  final int? scoreJoueur1;
  final int? scoreJoueur2;
  final String? gagnantId;
  final String? perdantId;
  final String montantMise;
  final String devise;

  /// en_cours | preuve_requise | nul_en_attente | verification | litige | termine
  final String statut;

  /// Chaque « rejouer » accepté par les deux joueurs l'incrémente SANS aucun
  /// mouvement d'argent. Absent des lignes anciennes : on lit `?? 1`.
  final int manche;

  /// Échéance du chrono courant, posée par le serveur (ISO). Égrenée côté
  /// client, sans aucun appel réseau.
  final String? echeance;

  /// confirmation | preuve | choix_nul
  final String echeanceType;
  final String? dateDebut;
  final String? dateFin;

  final String joueur1Nom;
  final String joueur2Nom;
  final String jeuNom;
  final String plateformeNom;

  bool get termine => statut == 'termine';
  bool get vivant => statut != 'termine';

  bool estParticipant(String utilisateurId) =>
      utilisateurId == joueur1Id || utilisateurId == joueur2Id;

  String adversaireDe(String utilisateurId) =>
      utilisateurId == joueur1Id ? joueur2Id : joueur1Id;

  String nomDe(String utilisateurId) =>
      utilisateurId == joueur1Id ? joueur1Nom : joueur2Nom;

  String nomAdversaireDe(String utilisateurId) =>
      utilisateurId == joueur1Id ? joueur2Nom : joueur1Nom;

  factory MatchDefi.depuisJson(Map<String, dynamic> json) => MatchDefi(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        defiId: texte(json, 'defiId'),
        joueur1Id: texte(json, 'joueur1Id'),
        joueur2Id: texte(json, 'joueur2Id'),
        scoreJoueur1: entierOuNull(json, 'scoreJoueur1'),
        scoreJoueur2: entierOuNull(json, 'scoreJoueur2'),
        gagnantId: texteOuNull(json, 'gagnantId'),
        perdantId: texteOuNull(json, 'perdantId'),
        montantMise: montantDe(json, 'montantMise'),
        devise: texte(json, 'devise', 'XOF'),
        statut: texte(json, 'statut', 'en_cours'),
        manche: entier(json, 'manche', 1) == 0 ? 1 : entier(json, 'manche', 1),
        echeance: texteOuNull(json, 'echeance'),
        echeanceType: texte(json, 'echeanceType'),
        dateDebut: texteOuNull(json, 'dateDebut'),
        dateFin: texteOuNull(json, 'dateFin'),
        joueur1Nom: texte(json, 'joueur1Nom'),
        joueur2Nom: texte(json, 'joueur2Nom'),
        jeuNom: texte(json, 'jeuNom'),
        plateformeNom: texte(json, 'plateformeNom'),
      );

  MatchDefi copieAvec({
    String? statut,
    int? manche,
    Object? echeance = _absent,
    String? echeanceType,
    Object? gagnantId = _absent,
    Object? perdantId = _absent,
    Object? scoreJoueur1 = _absent,
    Object? scoreJoueur2 = _absent,
  }) =>
      MatchDefi(
        id: id,
        dateCreation: dateCreation,
        defiId: defiId,
        joueur1Id: joueur1Id,
        joueur2Id: joueur2Id,
        scoreJoueur1: scoreJoueur1 == _absent ? this.scoreJoueur1 : scoreJoueur1 as int?,
        scoreJoueur2: scoreJoueur2 == _absent ? this.scoreJoueur2 : scoreJoueur2 as int?,
        gagnantId: gagnantId == _absent ? this.gagnantId : gagnantId as String?,
        perdantId: perdantId == _absent ? this.perdantId : perdantId as String?,
        montantMise: montantMise,
        devise: devise,
        statut: statut ?? this.statut,
        manche: manche ?? this.manche,
        echeance: echeance == _absent ? this.echeance : echeance as String?,
        echeanceType: echeanceType ?? this.echeanceType,
        dateDebut: dateDebut,
        dateFin: dateFin,
        joueur1Nom: joueur1Nom,
        joueur2Nom: joueur2Nom,
        jeuNom: jeuNom,
        plateformeNom: plateformeNom,
      );
}

/// Réponse de `GET /api/matchs/:id` — toutes les manches confondues, chaque
/// ligne portant son numéro de manche.
class DetailMatch {
  const DetailMatch({
    required this.match,
    required this.declarations,
    required this.choixNuls,
  });

  final MatchDefi match;
  final List<ResultatDeclare> declarations;
  final List<ChoixNul> choixNuls;

  factory DetailMatch.depuisJson(Map<String, dynamic> json) => DetailMatch(
        match: MatchDefi.depuisJson(objet(json['match'])),
        declarations: liste(json['declarations'], ResultatDeclare.depuisJson),
        choixNuls: liste(json['choixNuls'], ChoixNul.depuisJson),
      );

  DetailMatch copieAvec({
    MatchDefi? match,
    List<ResultatDeclare>? declarations,
    List<ChoixNul>? choixNuls,
  }) =>
      DetailMatch(
        match: match ?? this.match,
        declarations: declarations ?? this.declarations,
        choixNuls: choixNuls ?? this.choixNuls,
      );

  /// Déclarations de la manche en cours.
  List<ResultatDeclare> get declarationsCourantes =>
      declarations.where((d) => d.manche == match.manche).toList(growable: false);

  List<ChoixNul> get choixCourants =>
      choixNuls.where((c) => c.manche == match.manche).toList(growable: false);
}

const Object _absent = Object();

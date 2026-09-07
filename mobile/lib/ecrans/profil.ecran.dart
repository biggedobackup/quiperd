import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/bouton.dart';
import '../composants/communs/champ_mot_de_passe.dart';
import '../composants/communs/champ_texte.dart';
import '../composants/communs/confirmation.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/liste_deroulante.dart';
import '../composants/communs/message.dart';
import '../composants/communs/squelette.dart';
import '../etats/catalogue.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/compte_gamer.modele.dart';
import '../noyau/format.dart';
import '../noyau/pays.dart';
import '../noyau/resultat.dart';
import '../noyau/validateurs.dart';
import '../services/auth.service.dart';
import '../services/comptes_gamers.service.dart';
import '../services/utilisateurs.service.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';

/// Profil : informations personnelles, mot de passe et identifiants de joueur.
class ProfilEcran extends StatefulWidget {
  const ProfilEcran({super.key});

  @override
  State<ProfilEcran> createState() => _ProfilEcranState();
}

class _ProfilEcranState extends State<ProfilEcran> {
  final _clePseudo = GlobalKey<FormState>();
  final _cleMotDePasse = GlobalKey<FormState>();
  final _cleCompte = GlobalKey<FormState>();

  final _pseudo = TextEditingController();
  final _telephone = TextEditingController();
  final _photo = TextEditingController();
  String? _pays;

  final _actuel = TextEditingController();
  final _nouveau = TextEditingController();
  final _confirmation = TextEditingController();

  final _identifiant = TextEditingController();
  final _nomAffichage = TextEditingController();
  String? _jeuId;
  String? _plateformeId;

  List<CompteGamer> _comptes = const [];
  bool _chargementComptes = true;
  bool _envoiProfil = false;
  bool _envoiMotDePasse = false;
  bool _envoiCompte = false;

  @override
  void initState() {
    super.initState();
    final moi = context.read<SessionEtat>().utilisateur;
    _pseudo.text = moi?.nomUtilisateur ?? '';
    _telephone.text = moi?.telephone ?? '';
    _photo.text = moi?.photoProfil ?? '';
    _pays = trouverPays(moi?.pays)?.nom;
    WidgetsBinding.instance.addPostFrameCallback((_) => _chargerComptes());
  }

  @override
  void dispose() {
    _pseudo.dispose();
    _telephone.dispose();
    _photo.dispose();
    _actuel.dispose();
    _nouveau.dispose();
    _confirmation.dispose();
    _identifiant.dispose();
    _nomAffichage.dispose();
    super.dispose();
  }

  Future<void> _chargerComptes() async {
    final r = await ComptesGamersService.lister();
    if (!mounted) return;
    if (r is Succes<List<CompteGamer>>) _comptes = r.donnees;
    setState(() => _chargementComptes = false);
  }

  Future<void> _enregistrerProfil() async {
    final session = context.read<SessionEtat>();
    final moi = session.utilisateur;
    if (moi == null || _envoiProfil || !(_clePseudo.currentState?.validate() ?? false)) return;

    setState(() => _envoiProfil = true);
    final r = await UtilisateursService.modifierProfil(
      id: moi.id,
      nomUtilisateur: _pseudo.text.trim(),
      telephone: nettoyerTelephone(_telephone.text),
      pays: _pays,
      photoProfil: _photo.text.trim(),
    );
    if (!mounted) return;
    setState(() => _envoiProfil = false);

    if (r is Echec) {
      Message.erreur(context, 'Profil non modifié', (r as Echec).message);
      return;
    }
    await session.rafraichirUtilisateur();
    if (!mounted) return;
    Message.succes(context, 'Profil mis à jour');
  }

  Future<void> _changerMotDePasse() async {
    if (_envoiMotDePasse || !(_cleMotDePasse.currentState?.validate() ?? false)) return;
    setState(() => _envoiMotDePasse = true);
    final r = await AuthService.changerMotDePasse(
      motDePasseActuel: _actuel.text,
      nouveauMotDePasse: _nouveau.text,
    );
    if (!mounted) return;
    setState(() => _envoiMotDePasse = false);

    if (r is Echec<void>) {
      Message.erreur(context, 'Mot de passe non modifié', r.message);
      return;
    }
    _actuel.clear();
    _nouveau.clear();
    _confirmation.clear();
    Message.succes(context, 'Mot de passe modifié');
  }

  Future<void> _ajouterCompte() async {
    if (_envoiCompte || !(_cleCompte.currentState?.validate() ?? false)) return;
    if (_jeuId == null || _plateformeId == null) {
      Message.attention(context, 'Choix incomplet', 'Sélectionnez un jeu et une plateforme.');
      return;
    }
    setState(() => _envoiCompte = true);
    final r = await ComptesGamersService.creer(
      jeuId: _jeuId!,
      plateformeId: _plateformeId!,
      identifiantJoueur: _identifiant.text.trim(),
      nomAffichage: _nomAffichage.text.trim(),
    );
    if (!mounted) return;
    setState(() => _envoiCompte = false);

    if (r is Echec) {
      Message.erreur(context, 'Ajout impossible', (r as Echec).message);
      return;
    }
    _identifiant.clear();
    _nomAffichage.clear();
    Message.succes(context, 'Identifiant ajouté');
    _chargerComptes();
  }

  Future<void> _supprimerCompte(CompteGamer compte) async {
    final ok = await confirmer(
      context,
      titre: 'Supprimer cet identifiant ?',
      message: '${compte.identifiantJoueur} ne sera plus associé à votre compte.',
      libelleConfirmer: 'Supprimer',
      destructif: true,
    );
    if (!ok || !mounted) return;

    final r = await ComptesGamersService.supprimer(compte.id);
    if (!mounted) return;
    if (r is Echec<void>) {
      Message.erreur(context, 'Suppression impossible', r.message);
      return;
    }
    Message.succes(context, 'Identifiant supprimé');
    _chargerComptes();
  }

  @override
  Widget build(BuildContext context) {
    final moi = context.watch<SessionEtat>().utilisateur;
    if (moi == null) return const SizedBox.shrink();
    final catalogue = context.watch<CatalogueEtat>();

    final groupesPays = [
      GroupeOptions('Pays fréquents',
          paysFrequents.map((p) => OptionListe(p.nom, '${p.nom} (${p.indicatif})')).toList()),
      GroupeOptions('Tous les pays',
          paysParNom.map((p) => OptionListe(p.nom, '${p.nom} (${p.indicatif})')).toList()),
    ];

    return RefreshIndicator(
      onRefresh: _chargerComptes,
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          EnTetePage(
            surtitre: 'Compte',
            titre: moi.nomUtilisateur,
            description: 'Membre depuis le ${formatDate(moi.dateCreation)} · ${moi.email}',
          ),
          const SizedBox(height: 24),

          // ── Profil ──────────────────────────────────────────────────────────
          _Bloc(
            titre: 'Profil',
            enfant: Form(
              key: _clePseudo,
              child: Column(
                children: [
                  ChampTexte(
                    controleur: _pseudo,
                    label: 'Pseudo',
                    validateur: validerPseudo,
                  ),
                  const SizedBox(height: 16),
                  ListeDeroulante(
                    label: 'Pays',
                    valeur: _pays,
                    groupes: groupesPays,
                    placeholder: 'Choisissez votre pays',
                    onChanged: (v) {
                      setState(() => _pays = v);
                      final indicatif = indicatifPays(v);
                      if (indicatif.isNotEmpty && nettoyerTelephone(_telephone.text) == null) {
                        _telephone.text = '$indicatif ';
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _telephone,
                    label: 'Téléphone',
                    placeholder: '+225 07 00 00 00 00',
                    clavier: TextInputType.phone,
                    aide: 'Format international. Sert uniquement à vous joindre.',
                    validateur: validerTelephone,
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _photo,
                    label: 'Photo de profil (URL)',
                    placeholder: 'https://…',
                    clavier: TextInputType.url,
                  ),
                  const SizedBox(height: 18),
                  Bouton(
                    libelle: 'Enregistrer',
                    bloc: true,
                    icone: Icons.check,
                    chargement: _envoiProfil,
                    onPressed: _enregistrerProfil,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Mot de passe ────────────────────────────────────────────────────
          _Bloc(
            titre: 'Mot de passe',
            enfant: Form(
              key: _cleMotDePasse,
              child: Column(
                children: [
                  ChampMotDePasse(
                    controleur: _actuel,
                    label: 'Mot de passe actuel',
                    validateur: validerRequis,
                  ),
                  const SizedBox(height: 16),
                  ChampMotDePasse(
                    controleur: _nouveau,
                    label: 'Nouveau',
                    aide: '6 caractères minimum',
                    saisieAutomatique: const [AutofillHints.newPassword],
                    validateur: validerMotDePasse,
                  ),
                  const SizedBox(height: 16),
                  ChampMotDePasse(
                    controleur: _confirmation,
                    label: 'Confirmation',
                    saisieAutomatique: const [AutofillHints.newPassword],
                    validateur: (v) =>
                        v != _nouveau.text ? 'Les mots de passe ne correspondent pas' : null,
                  ),
                  const SizedBox(height: 18),
                  Bouton(
                    libelle: 'Changer',
                    bloc: true,
                    variante: VarianteBouton.secondaire,
                    icone: Icons.key_outlined,
                    chargement: _envoiMotDePasse,
                    onPressed: _changerMotDePasse,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Comptes gamers ──────────────────────────────────────────────────
          Text('Mes identifiants de joueur', style: Typo.h3),
          const SizedBox(height: 4),
          Text(
            'Votre pseudo dans chaque jeu, pour que l’adversaire vous trouve en ligne.',
            style: Typo.legende.copyWith(color: Couleurs.muet),
          ),
          const SizedBox(height: 16),
          if (_chargementComptes)
            const SqueletteCartes(nombre: 2, hauteur: 68)
          else if (_comptes.isEmpty)
            const EtatVide(
              icone: Icons.sports_esports_outlined,
              titre: 'Aucun identifiant',
              description: 'Ajoutez votre pseudo en jeu pour chaque jeu et plateforme sur '
                  'lesquels vous jouez.',
            )
          else
            ..._comptes.map(
              (c) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Couleurs.papier,
                    border: Border.all(color: Couleurs.trait),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: Couleurs.gris,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.sports_esports, size: 18, color: Couleurs.muet),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.identifiantJoueur,
                                style: Typo.chiffres(taille: 14, poids: 700),
                                overflow: TextOverflow.ellipsis),
                            Text(
                              '${catalogue.nomJeu(c.jeuId)} · '
                              '${catalogue.nomPlateforme(c.plateformeId)}'
                              '${c.nomAffichage.isNotEmpty ? ' · ${c.nomAffichage}' : ''}',
                              style: Typo.petit,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => _supprimerCompte(c),
                        icon: const Icon(Icons.close, size: 18),
                        color: Couleurs.perte,
                        tooltip: 'Supprimer',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          _Bloc(
            titre: 'Ajouter un identifiant',
            enfant: Form(
              key: _cleCompte,
              child: Column(
                children: [
                  ListeDeroulante(
                    label: 'Jeu',
                    valeur: _jeuId,
                    placeholder: 'Choisissez un jeu',
                    groupes: catalogue.jeuxGroupes.entries
                        .map((e) => GroupeOptions(
                              e.key.libelle,
                              e.value.map((j) => OptionListe(j.id, j.nom)).toList(),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _jeuId = v),
                  ),
                  const SizedBox(height: 16),
                  ListeDeroulante(
                    label: 'Plateforme',
                    valeur: _plateformeId,
                    placeholder: 'Choisissez une plateforme',
                    groupes: catalogue.plateformesGroupees.entries
                        .map((e) => GroupeOptions(
                              e.key.libelle,
                              e.value.map((p) => OptionListe(p.id, p.nom)).toList(),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _plateformeId = v),
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _identifiant,
                    label: 'Identifiant en jeu',
                    placeholder: 'Kader225_PSN',
                    longueurMax: 150,
                    validateur: validerRequis,
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _nomAffichage,
                    label: 'Nom affiché (optionnel)',
                    longueurMax: 150,
                  ),
                  const SizedBox(height: 18),
                  Bouton(
                    libelle: 'Ajouter',
                    bloc: true,
                    icone: Icons.add,
                    chargement: _envoiCompte,
                    onPressed: _ajouterCompte,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bloc extends StatelessWidget {
  const _Bloc({required this.titre, required this.enfant});

  final String titre;
  final Widget enfant;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titre, style: Typo.h3),
          const SizedBox(height: 16),
          enfant,
        ],
      ),
    );
  }
}

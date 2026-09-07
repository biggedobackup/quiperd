import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_mot_de_passe.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/liste_deroulante.dart';
import '../../composants/communs/logo.dart';
import '../../composants/communs/message.dart';
import '../../etats/session.etat.dart';
import '../../noyau/pays.dart';
import '../../noyau/resultat.dart';
import '../../noyau/validateurs.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import 'connexion.ecran.dart';

/// Création de compte. Mêmes champs que le site, dans le même ordre.
class InscriptionEcran extends StatefulWidget {
  const InscriptionEcran({super.key});

  @override
  State<InscriptionEcran> createState() => _InscriptionEcranState();
}

class _InscriptionEcranState extends State<InscriptionEcran> {
  final _cle = GlobalKey<FormState>();
  final _pseudo = TextEditingController();
  final _email = TextEditingController();
  final _motDePasse = TextEditingController();
  final _confirmation = TextEditingController();
  final _telephone = TextEditingController();
  String? _pays;
  bool _envoi = false;

  @override
  void dispose() {
    _pseudo.dispose();
    _email.dispose();
    _motDePasse.dispose();
    _confirmation.dispose();
    _telephone.dispose();
    super.dispose();
  }

  /// Au choix du pays, on préremplit l'indicatif si le numéro est vide — un
  /// joueur ne devrait pas avoir à chercher le sien.
  void _surPays(String? valeur) {
    setState(() => _pays = valeur);
    final indicatif = indicatifPays(valeur);
    final actuel = _telephone.text.trim();
    if (indicatif.isNotEmpty && (actuel.isEmpty || nettoyerTelephone(actuel) == null)) {
      _telephone.text = '$indicatif ';
    }
  }

  Future<void> _inscrire() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);

    final r = await context.read<SessionEtat>().inscription(
          nomUtilisateur: _pseudo.text.trim(),
          email: _email.text.trim(),
          motDePasse: _motDePasse.text,
          telephone: nettoyerTelephone(_telephone.text),
          pays: _pays,
        );

    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      Message.erreur(
        context,
        r.statut == 409 ? 'Compte déjà existant' : 'Inscription impossible',
        r.message,
      );
      return;
    }
    Message.succes(
      context,
      'Bienvenue dans l’arène',
      'Un code de confirmation vient de partir vers votre adresse e-mail.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupes = [
      GroupeOptions(
        'Pays fréquents',
        paysFrequents.map((p) => OptionListe(p.nom, '${p.nom} (${p.indicatif})')).toList(),
      ),
      GroupeOptions(
        'Tous les pays',
        paysParNom.map((p) => OptionListe(p.nom, '${p.nom} (${p.indicatif})')).toList(),
      ),
    ];

    return Scaffold(
      backgroundColor: Couleurs.craie,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          child: Form(
            key: _cle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Logo(taille: 34),
                const SizedBox(height: 40),
                Text('ARÈNE', style: Typo.etiquette.copyWith(color: Couleurs.vert)),
                const SizedBox(height: 10),
                Text('Créer un compte', style: Typo.h1),
                const SizedBox(height: 8),
                Text(
                  'Quelques secondes suffisent pour lancer votre premier défi.',
                  style: Typo.legende.copyWith(color: Couleurs.muet),
                ),
                const SizedBox(height: 28),
                ChampTexte(
                  controleur: _pseudo,
                  label: 'Pseudo Défis en Ligne',
                  placeholder: 'kader225',
                  icone: Icons.person_outline,
                  saisieAutomatique: const [AutofillHints.username],
                  actionClavier: TextInputAction.next,
                  validateur: validerPseudo,
                ),
                const SizedBox(height: 18),
                ChampTexte(
                  controleur: _email,
                  label: 'E-mail',
                  placeholder: 'vous@exemple.com',
                  icone: Icons.mail_outline,
                  clavier: TextInputType.emailAddress,
                  saisieAutomatique: const [AutofillHints.email],
                  actionClavier: TextInputAction.next,
                  validateur: validerEmail,
                ),
                const SizedBox(height: 18),
                ChampMotDePasse(
                  controleur: _motDePasse,
                  label: 'Mot de passe',
                  aide: '6 caractères minimum',
                  saisieAutomatique: const [AutofillHints.newPassword],
                  actionClavier: TextInputAction.next,
                  validateur: validerMotDePasse,
                ),
                const SizedBox(height: 18),
                ChampMotDePasse(
                  controleur: _confirmation,
                  label: 'Confirmation',
                  saisieAutomatique: const [AutofillHints.newPassword],
                  actionClavier: TextInputAction.next,
                  validateur: (valeur) => valeur != _motDePasse.text
                      ? 'Les mots de passe ne correspondent pas'
                      : null,
                ),
                const SizedBox(height: 18),
                ListeDeroulante(
                  label: 'Pays',
                  valeur: _pays,
                  groupes: groupes,
                  placeholder: 'Choisissez votre pays',
                  onChanged: _surPays,
                ),
                const SizedBox(height: 18),
                ChampTexte(
                  controleur: _telephone,
                  label: 'Téléphone',
                  placeholder: '+225 07 00 00 00 00',
                  icone: Icons.phone_outlined,
                  clavier: TextInputType.phone,
                  aide: 'Format international. Sert uniquement à vous joindre.',
                  actionClavier: TextInputAction.done,
                  validateur: validerTelephone,
                ),
                const SizedBox(height: 26),
                Bouton(
                  libelle: 'Créer mon compte',
                  bloc: true,
                  taille: TailleBouton.lg,
                  variante: VarianteBouton.volt,
                  iconeFin: Icons.arrow_forward,
                  chargement: _envoi,
                  onPressed: _inscrire,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Déjà un compte ?', style: Typo.legende.copyWith(color: Couleurs.muet)),
                    const SizedBox(width: 6),
                    Bouton(
                      libelle: 'Se connecter',
                      variante: VarianteBouton.lien,
                      // On revient à la connexion en dépilant quand elle est
                      // dessous ; on ne l'empile une seconde fois que si cet
                      // écran est arrivé en premier (lien d'onboarding).
                      onPressed: () {
                        final navigateur = Navigator.of(context);
                        if (navigateur.canPop()) {
                          navigateur.pop();
                        } else {
                          navigateur.push(
                            MaterialPageRoute(builder: (_) => const ConnexionEcran()),
                          );
                        }
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

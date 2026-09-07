import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_mot_de_passe.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/logo.dart';
import '../../composants/communs/message.dart';
import '../../etats/session.etat.dart';
import '../../noyau/resultat.dart';
import '../../noyau/validateurs.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import 'inscription.ecran.dart';
import 'mot_de_passe_oublie.ecran.dart';

/// Connexion. Le champ accepte l'e-mail **ou** le pseudo : le backend teste les
/// deux colonnes, d'où le libellé « E-mail ou pseudo », comme sur le site.
class ConnexionEcran extends StatefulWidget {
  const ConnexionEcran({super.key});

  @override
  State<ConnexionEcran> createState() => _ConnexionEcranState();
}

class _ConnexionEcranState extends State<ConnexionEcran> {
  final _cle = GlobalKey<FormState>();
  final _identifiant = TextEditingController();
  final _motDePasse = TextEditingController();
  bool _envoi = false;

  @override
  void dispose() {
    _identifiant.dispose();
    _motDePasse.dispose();
    super.dispose();
  }

  Future<void> _connecter() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);

    final r = await context.read<SessionEtat>().connexion(
          email: _identifiant.text.trim(),
          motDePasse: _motDePasse.text,
        );

    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      Message.erreur(
        context,
        r.statut == 401 ? 'Identifiants invalides' : 'Connexion impossible',
        r.message,
      );
      return;
    }
    // L'aiguillage racine bascule tout seul vers l'espace joueur : rien à
    // pousser ici, sinon l'écran de connexion resterait sous la pile.
  }

  @override
  Widget build(BuildContext context) {
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
                Text('Connexion', style: Typo.h1),
                const SizedBox(height: 8),
                Text(
                  'Retrouvez vos défis, vos matchs et votre solde.',
                  style: Typo.legende.copyWith(color: Couleurs.muet),
                ),
                const SizedBox(height: 28),
                ChampTexte(
                  controleur: _identifiant,
                  label: 'E-mail ou pseudo',
                  placeholder: 'kader225',
                  icone: Icons.person_outline,
                  clavier: TextInputType.emailAddress,
                  saisieAutomatique: const [AutofillHints.username],
                  actionClavier: TextInputAction.next,
                  validateur: validerRequis,
                ),
                const SizedBox(height: 18),
                ChampMotDePasse(
                  controleur: _motDePasse,
                  label: 'Mot de passe',
                  saisieAutomatique: const [AutofillHints.password],
                  actionClavier: TextInputAction.done,
                  onSubmitted: (_) => _connecter(),
                  validateur: validerRequis,
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: Bouton(
                    libelle: 'Mot de passe oublié ?',
                    variante: VarianteBouton.lien,
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const MotDePasseOublieEcran()),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Bouton(
                  libelle: 'Se connecter',
                  bloc: true,
                  taille: TailleBouton.lg,
                  variante: VarianteBouton.volt,
                  iconeFin: Icons.arrow_forward,
                  chargement: _envoi,
                  onPressed: _connecter,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Pas encore de compte ?', style: Typo.legende.copyWith(color: Couleurs.muet)),
                    const SizedBox(width: 6),
                    Bouton(
                      libelle: 'Créer un compte',
                      variante: VarianteBouton.lien,
                      // `push`, jamais `pushReplacement` : cet écran est le
                      // contenu de la route racine, la remplacer démonterait
                      // l'aiguillage qui bascule vers l'espace joueur.
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const InscriptionEcran()),
                      ),
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

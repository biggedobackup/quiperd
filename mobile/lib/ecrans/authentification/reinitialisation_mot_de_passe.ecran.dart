import 'package:flutter/material.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_mot_de_passe.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/message.dart';
import '../../noyau/resultat.dart';
import '../../noyau/validateurs.dart';
import '../../services/auth.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Saisie du nouveau mot de passe.
///
/// Le jeton arrive par e-mail dans un lien vers le site ; sur mobile, le joueur
/// le recopie. Le champ accepte donc aussi bien le jeton seul que l'URL
/// complète — recopier une adresse à la main est une source d'erreur inutile.
class ReinitialisationMotDePasseEcran extends StatefulWidget {
  const ReinitialisationMotDePasseEcran({super.key, this.token});

  final String? token;

  @override
  State<ReinitialisationMotDePasseEcran> createState() =>
      _ReinitialisationMotDePasseEcranState();
}

class _ReinitialisationMotDePasseEcranState
    extends State<ReinitialisationMotDePasseEcran> {
  final _cle = GlobalKey<FormState>();
  late final _token = TextEditingController(text: widget.token ?? '');
  final _motDePasse = TextEditingController();
  final _confirmation = TextEditingController();
  bool _envoi = false;

  @override
  void dispose() {
    _token.dispose();
    _motDePasse.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  /// Extrait le jeton d'une URL collée (`…?token=…`) ou le rend tel quel.
  String get _jetonPropre {
    final brut = _token.text.trim();
    final uri = Uri.tryParse(brut);
    final depuisUrl = uri?.queryParameters['token'];
    return (depuisUrl != null && depuisUrl.isNotEmpty) ? depuisUrl : brut;
  }

  Future<void> _reinitialiser() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);

    final r = await AuthService.reinitialiserMotDePasse(
      token: _jetonPropre,
      nouveauMotDePasse: _motDePasse.text,
    );

    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      Message.erreur(context, 'Réinitialisation impossible', r.message);
      return;
    }
    Message.succes(context, 'Mot de passe modifié', 'Connectez-vous avec le nouveau.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Nouveau mot de passe')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          child: Form(
            key: _cle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Nouveau mot de passe', style: Typo.h2),
                const SizedBox(height: 8),
                Text(
                  'Collez le lien reçu par e-mail, ou seulement le code qu’il contient.',
                  style: Typo.legende.copyWith(color: Couleurs.muet),
                ),
                const SizedBox(height: 26),
                ChampTexte(
                  controleur: _token,
                  label: 'Lien ou code reçu',
                  placeholder: 'https://…/reinitialisation-mot-de-passe?token=…',
                  icone: Icons.link,
                  lignes: 2,
                  validateur: (valeur) =>
                      _jetonPropre.isEmpty ? 'Collez le lien ou le code reçu' : null,
                ),
                const SizedBox(height: 18),
                ChampMotDePasse(
                  controleur: _motDePasse,
                  label: 'Nouveau mot de passe',
                  aide: '6 caractères minimum',
                  saisieAutomatique: const [AutofillHints.newPassword],
                  validateur: validerMotDePasse,
                ),
                const SizedBox(height: 18),
                ChampMotDePasse(
                  controleur: _confirmation,
                  label: 'Confirmation',
                  saisieAutomatique: const [AutofillHints.newPassword],
                  validateur: (valeur) => valeur != _motDePasse.text
                      ? 'Les mots de passe ne correspondent pas'
                      : null,
                ),
                const SizedBox(height: 26),
                Bouton(
                  libelle: 'Enregistrer',
                  bloc: true,
                  taille: TailleBouton.lg,
                  variante: VarianteBouton.volt,
                  icone: Icons.check,
                  chargement: _envoi,
                  onPressed: _reinitialiser,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

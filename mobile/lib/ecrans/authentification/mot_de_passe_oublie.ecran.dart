import 'package:flutter/material.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/message.dart';
import '../../noyau/resultat.dart';
import '../../noyau/validateurs.dart';
import '../../services/auth.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import 'reinitialisation_mot_de_passe.ecran.dart';

/// Demande de réinitialisation.
///
/// La réponse du serveur est volontairement **identique que le compte existe ou
/// non** (pas d'énumération de comptes) : l'écran affiche donc toujours le même
/// message de confirmation.
class MotDePasseOublieEcran extends StatefulWidget {
  const MotDePasseOublieEcran({super.key});

  @override
  State<MotDePasseOublieEcran> createState() => _MotDePasseOublieEcranState();
}

class _MotDePasseOublieEcranState extends State<MotDePasseOublieEcran> {
  final _cle = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _envoi = false;
  bool _envoye = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _envoyer() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);
    final r = await AuthService.motDePasseOublie(_email.text.trim());
    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      Message.erreur(context, 'Demande impossible', r.message);
      return;
    }
    setState(() => _envoye = true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Mot de passe oublié')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          child: Form(
            key: _cle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Mot de passe oublié', style: Typo.h2),
                const SizedBox(height: 8),
                Text(
                  'Nous vous envoyons un lien de réinitialisation, valable une heure.',
                  style: Typo.legende.copyWith(color: Couleurs.muet),
                ),
                const SizedBox(height: 26),
                if (_envoye) ...[
                  const Encart(
                    ton: TonMessage.succes,
                    texte: 'Si un compte existe avec cette adresse, un lien vient de partir. '
                        'Pensez à regarder vos indésirables.',
                  ),
                  const SizedBox(height: 20),
                  Bouton(
                    libelle: 'J’ai reçu un lien',
                    bloc: true,
                    taille: TailleBouton.lg,
                    variante: VarianteBouton.volt,
                    icone: Icons.key_outlined,
                    onPressed: () => Navigator.of(context).pushReplacement(
                      MaterialPageRoute(
                        builder: (_) => const ReinitialisationMotDePasseEcran(),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Bouton(
                    libelle: 'Retour à la connexion',
                    bloc: true,
                    variante: VarianteBouton.secondaire,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ] else ...[
                  ChampTexte(
                    controleur: _email,
                    label: 'E-mail',
                    placeholder: 'vous@exemple.com',
                    icone: Icons.mail_outline,
                    clavier: TextInputType.emailAddress,
                    saisieAutomatique: const [AutofillHints.email],
                    actionClavier: TextInputAction.done,
                    validateur: validerEmail,
                    onSubmitted: (_) => _envoyer(),
                  ),
                  const SizedBox(height: 24),
                  Bouton(
                    libelle: 'Envoyer le lien',
                    bloc: true,
                    taille: TailleBouton.lg,
                    variante: VarianteBouton.volt,
                    icone: Icons.send_outlined,
                    chargement: _envoi,
                    onPressed: _envoyer,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

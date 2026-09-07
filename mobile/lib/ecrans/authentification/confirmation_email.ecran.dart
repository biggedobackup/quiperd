import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/message.dart';
import '../../etats/session.etat.dart';
import '../../noyau/resultat.dart';
import '../../services/auth.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Confirmation de l'adresse e-mail par un code à 6 chiffres.
///
/// Le code vit 30 minutes, avec 5 essais maximum ; le renvoi est verrouillé
/// 60 secondes côté serveur — le bouton décompte donc ce délai plutôt que de
/// laisser le joueur se prendre un 429.
class ConfirmationEmailEcran extends StatefulWidget {
  const ConfirmationEmailEcran({super.key});

  @override
  State<ConfirmationEmailEcran> createState() => _ConfirmationEmailEcranState();
}

class _ConfirmationEmailEcranState extends State<ConfirmationEmailEcran> {
  static const int _longueur = 6;

  final List<TextEditingController> _champs =
      List.generate(_longueur, (_) => TextEditingController());
  final List<FocusNode> _focus = List.generate(_longueur, (_) => FocusNode());

  bool _envoi = false;
  bool _renvoi = false;
  int _attenteRenvoi = 0;
  Timer? _decompte;

  String get _code => _champs.map((c) => c.text).join();
  bool get _complet => _code.length == _longueur;

  @override
  void dispose() {
    _decompte?.cancel();
    for (final c in _champs) {
      c.dispose();
    }
    for (final f in _focus) {
      f.dispose();
    }
    super.dispose();
  }

  void _demarrerDecompte([int secondes = 60]) {
    _decompte?.cancel();
    setState(() => _attenteRenvoi = secondes);
    _decompte = Timer.periodic(const Duration(seconds: 1), (minuterie) {
      if (!mounted) {
        minuterie.cancel();
        return;
      }
      setState(() => _attenteRenvoi--);
      if (_attenteRenvoi <= 0) minuterie.cancel();
    });
  }

  void _surSaisie(int index, String valeur) {
    // Collage du code entier dans la première case : on le répartit.
    if (valeur.length > 1) {
      final chiffres = valeur.replaceAll(RegExp(r'\D'), '');
      for (var i = 0; i < _longueur; i++) {
        _champs[i].text = i < chiffres.length ? chiffres[i] : '';
      }
      setState(() {});
      final cible = chiffres.length >= _longueur ? _longueur - 1 : chiffres.length;
      _focus[cible.clamp(0, _longueur - 1)].requestFocus();
      if (_complet) _verifier();
      return;
    }

    setState(() {});
    if (valeur.isNotEmpty && index < _longueur - 1) {
      _focus[index + 1].requestFocus();
    }
    if (_complet) _verifier();
  }

  Future<void> _verifier() async {
    if (_envoi || !_complet) return;
    setState(() => _envoi = true);
    FocusScope.of(context).unfocus();

    final r = await AuthService.verifierEmail(_code);
    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      // Code faux : on vide les cases pour que le joueur reparte proprement.
      for (final c in _champs) {
        c.clear();
      }
      setState(() {});
      _focus.first.requestFocus();
      Message.erreur(context, 'Code refusé', r.message);
      return;
    }

    await context.read<SessionEtat>().rafraichirUtilisateur();
    if (!mounted) return;
    Message.succes(context, 'Adresse confirmée', 'Vous pouvez miser et retirer.');
    Navigator.of(context).pop(true);
  }

  Future<void> _renvoyer() async {
    if (_renvoi || _attenteRenvoi > 0) return;
    setState(() => _renvoi = true);
    final r = await AuthService.renvoyerCodeEmail();
    if (!mounted) return;
    setState(() => _renvoi = false);

    if (r is Echec<void>) {
      // 429 : le verrou anti-renvoi n'est pas encore levé.
      if (r.statut == 429) _demarrerDecompte();
      Message.attention(context, 'Renvoi impossible', r.message);
      return;
    }
    _demarrerDecompte();
    Message.info(context, 'Code renvoyé', 'Regardez aussi vos indésirables.');
  }

  @override
  Widget build(BuildContext context) {
    final email = context.watch<SessionEtat>().utilisateur?.email ?? '';

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Confirmer l’e-mail')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('SÉCURITÉ', style: Typo.etiquette.copyWith(color: Couleurs.vert)),
              const SizedBox(height: 10),
              Text('Confirmez votre e-mail', style: Typo.h2),
              const SizedBox(height: 8),
              Text(
                'De l’argent réel transite par votre compte : nous vérifions une seule '
                'fois que cette adresse est bien la vôtre.',
                style: Typo.legende.copyWith(color: Couleurs.muet),
              ),
              const SizedBox(height: 18),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Couleurs.gris,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.mail_outline, size: 18, color: Couleurs.muet),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(email,
                          style: Typo.legendeForte, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              Text('CODE À 6 CHIFFRES',
                  style: Typo.etiquette.copyWith(color: Couleurs.muet)),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(_longueur, (i) => _Case(
                      controleur: _champs[i],
                      focus: _focus[i],
                      index: i,
                      actif: !_envoi,
                      onChange: (valeur) => _surSaisie(i, valeur),
                      onRetour: () {
                        if (_champs[i].text.isEmpty && i > 0) {
                          _champs[i - 1].clear();
                          _focus[i - 1].requestFocus();
                          setState(() {});
                        }
                      },
                    )),
              ),
              const SizedBox(height: 24),
              Bouton(
                libelle: 'Confirmer',
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.volt,
                iconeFin: Icons.check,
                chargement: _envoi,
                onPressed: _complet ? _verifier : null,
              ),
              const SizedBox(height: 10),
              Bouton(
                libelle: _attenteRenvoi > 0
                    ? 'Renvoyer dans ${_attenteRenvoi}s'
                    : 'Renvoyer un code',
                bloc: true,
                variante: VarianteBouton.secondaire,
                icone: Icons.refresh,
                chargement: _renvoi,
                onPressed: _attenteRenvoi > 0 ? null : _renvoyer,
              ),
              const SizedBox(height: 18),
              Text(
                'Le code est valable 30 minutes, avec 5 essais. Au-delà, demandez-en un '
                'nouveau. Le dépôt reste possible sans confirmation — seuls les défis et '
                'les retraits l’exigent.',
                style: Typo.petit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Case extends StatelessWidget {
  const _Case({
    required this.controleur,
    required this.focus,
    required this.index,
    required this.actif,
    required this.onChange,
    required this.onRetour,
  });

  final TextEditingController controleur;
  final FocusNode focus;
  final int index;
  final bool actif;
  final ValueChanged<String> onChange;
  final VoidCallback onRetour;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 58,
      child: KeyboardListener(
        focusNode: FocusNode(skipTraversal: true),
        onKeyEvent: (evenement) {
          if (evenement is KeyDownEvent &&
              evenement.logicalKey == LogicalKeyboardKey.backspace) {
            onRetour();
          }
        },
        child: TextField(
          controller: controleur,
          focusNode: focus,
          enabled: actif,
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          // Pas de `maxLength: 1` : il empêcherait le collage du code entier.
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: Typo.chiffres(taille: 22, poids: 700),
          onChanged: onChange,
          decoration: const InputDecoration(
            contentPadding: EdgeInsets.zero,
            counterText: '',
          ),
        ),
      ),
    );
  }
}

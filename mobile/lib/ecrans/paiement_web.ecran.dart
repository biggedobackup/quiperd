import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../composants/communs/bouton.dart';
import '../composants/communs/message.dart';
import '../noyau/reseau.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';

/// Page de paiement du prestataire, affichée **dans** l'application.
///
/// Le joueur ne quitte plus Défis en Ligne pour payer : l'application reste vivante
/// derrière, socket connecté, ce qui permet de refermer cet écran tout seul dès
/// que le statut du paiement arrive — au lieu de compter sur le joueur pour
/// revenir depuis le navigateur du système.
///
/// Le navigateur externe reste proposé en secours : si la page hébergée refusait
/// de s'afficher ici, le joueur ne doit pas se retrouver bloqué avec son argent
/// engagé nulle part.
class PaiementWebEcran extends StatefulWidget {
  const PaiementWebEcran({super.key, required this.url, required this.titre});

  final String url;
  final String titre;

  @override
  State<PaiementWebEcran> createState() => _PaiementWebEcranState();
}

class _PaiementWebEcranState extends State<PaiementWebEcran> {
  late final WebViewController _controleur;
  int _progression = 0;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _controleur = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Couleurs.papier)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progression = p);
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _erreur = null);
          },
          // La WebView est un composant natif : les overrides `dart:io` de
          // `ReseauPermissif` ne s'appliquent pas à elle. Sans ce rappel, une page
          // de paiement servie par un serveur interne au certificat auto-signé
          // resterait blanche, sans message exploitable. Rappel non posé quand le
          // mode permissif est coupé : Android et iOS refusent alors d'eux-mêmes.
          onSslAuthError: ReseauPermissif.actif ? (erreur) => erreur.proceed() : null,
          onWebResourceError: (erreur) {
            // Une ressource secondaire qui échoue (police, pixel de suivi) ne doit
            // pas faire croire au joueur que le paiement est cassé : seul l'échec
            // du document principal compte.
            if (!erreur.isForMainFrame!) return;
            if (mounted) setState(() => _erreur = erreur.description);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  Future<void> _ouvrirDehors() async {
    final ouvert = await launchUrl(Uri.parse(widget.url), mode: LaunchMode.externalApplication);
    if (!mounted || ouvert) return;
    Message.erreur(context, 'Page inaccessible', 'Réessayez dans un instant.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.papier,
      appBar: AppBar(
        title: Text(widget.titre),
        actions: [
          IconButton(
            onPressed: _ouvrirDehors,
            icon: const Icon(Icons.open_in_new),
            tooltip: 'Ouvrir dans le navigateur',
          ),
        ],
        bottom: _progression > 0 && _progression < 100
            ? PreferredSize(
                preferredSize: const Size.fromHeight(2),
                child: LinearProgressIndicator(
                  value: _progression / 100,
                  minHeight: 2,
                  backgroundColor: Couleurs.gris,
                  color: Couleurs.vert,
                ),
              )
            : null,
      ),
      body: SafeArea(
        child: _erreur == null
            ? WebViewWidget(controller: _controleur)
            : Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.wifi_off, size: 40, color: Couleurs.muet),
                    const SizedBox(height: 12),
                    Text('Page de paiement inaccessible', style: Typo.h3, textAlign: TextAlign.center),
                    const SizedBox(height: 6),
                    Text(
                      'Vérifiez votre connexion, puis réessayez. Vous pouvez aussi ouvrir la '
                      'page dans votre navigateur : le paiement reste valable.',
                      style: Typo.petit,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 18),
                    Bouton(
                      libelle: 'Réessayer',
                      bloc: true,
                      variante: VarianteBouton.volt,
                      icone: Icons.refresh,
                      onPressed: () {
                        setState(() => _erreur = null);
                        _controleur.loadRequest(Uri.parse(widget.url));
                      },
                    ),
                    const SizedBox(height: 10),
                    Bouton(
                      libelle: 'Ouvrir dans le navigateur',
                      bloc: true,
                      variante: VarianteBouton.secondaire,
                      icone: Icons.open_in_new,
                      onPressed: _ouvrirDehors,
                    ),
                  ],
                ),
              ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Ne quittez pas cet écran avant d’avoir validé la demande sur votre téléphone. '
                'Votre solde se met à jour tout seul.',
                style: Typo.petit,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Bouton(
                libelle: 'Fermer',
                bloc: true,
                variante: VarianteBouton.secondaire,
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

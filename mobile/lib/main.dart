import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'noyau/reseau.dart';
import 'services/push.service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Avant la première requête : l'API et le socket sont joints sur des serveurs
  // internes dont le certificat n'est pas signé par une autorité connue du
  // téléphone. Voir `noyau/reseau.dart` pour la contrepartie et l'interrupteur.
  ReseauPermissif.installer();

  // Dates et montants en français : sans cette initialisation, `DateFormat`
  // lève une exception dès le premier écran qui affiche une date.
  await initializeDateFormatting('fr_FR');

  // Notifications push. À faire AVANT `runApp` : c'est ici qu'on récupère le message qui a
  // lancé l'application quand le joueur a appuyé sur une bannière, et la session s'ouvre dès
  // la première frame — trop tard pour poser les écoutes. L'appel ne lève jamais : sans
  // Google Play Services, l'application démarre simplement sans push.
  await Push.initialiser();

  // L'application est pensée pour être tenue à une main : aucune mise en page
  // paysage n'a été dessinée, et un tableau de score qui bascule à l'horizontale
  // pendant un match ne rend service à personne.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const ApplicationDefisEnLigne());
}

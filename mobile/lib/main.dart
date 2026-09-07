import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'noyau/reseau.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Avant la première requête : l'API et le socket sont joints sur des serveurs
  // internes dont le certificat n'est pas signé par une autorité connue du
  // téléphone. Voir `noyau/reseau.dart` pour la contrepartie et l'interrupteur.
  ReseauPermissif.installer();

  // Dates et montants en français : sans cette initialisation, `DateFormat`
  // lève une exception dès le premier écran qui affiche une date.
  await initializeDateFormatting('fr_FR');

  // L'application est pensée pour être tenue à une main : aucune mise en page
  // paysage n'a été dessinée, et un tableau de score qui bascule à l'horizontale
  // pendant un match ne rend service à personne.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const ApplicationQuiPerd());
}

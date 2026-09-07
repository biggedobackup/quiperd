import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../noyau/resultat.dart';
import '../../services/preuves.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/bouton.dart';
import '../communs/message.dart';

/// Envoi d'une preuve de match : capture d'écran ou vidéo.
///
/// Deux garde-fous côté client, parce qu'un envoi raté sur un réseau mobile
/// faible coûte cher au joueur : la **taille** est vérifiée avant de partir
/// (50 Mo, sinon 413 après plusieurs minutes d'attente), et la **durée** de la
/// vidéo est bornée à la capture.
class EnvoiPreuve extends StatefulWidget {
  const EnvoiPreuve({super.key, required this.matchId, required this.onEnvoye});

  final String matchId;
  final VoidCallback onEnvoye;

  @override
  State<EnvoiPreuve> createState() => _EnvoiPreuveState();
}

class _EnvoiPreuveState extends State<EnvoiPreuve> {
  final ImagePicker _selecteur = ImagePicker();

  String _type = 'capture_ecran';
  File? _fichier;
  bool _envoi = false;
  double _progression = 0;

  bool get _estVideo => _type == 'video';

  Future<void> _choisir({required bool appareilPhoto}) async {
    try {
      final XFile? choisi = _estVideo
          ? await _selecteur.pickVideo(
              source: appareilPhoto ? ImageSource.camera : ImageSource.gallery,
              // Une vidéo de fin de match n'a pas besoin d'être longue ; au-delà,
              // l'envoi échoue sur un réseau faible.
              maxDuration: const Duration(minutes: 2),
            )
          : await _selecteur.pickImage(
              source: appareilPhoto ? ImageSource.camera : ImageSource.gallery,
              imageQuality: 88,
            );
      if (choisi == null) return;

      final fichier = File(choisi.path);
      final octets = await fichier.length();
      if (octets > PreuvesService.tailleMaxOctets) {
        if (!mounted) return;
        Message.erreur(context, 'Fichier trop volumineux', 'Limite : 50 Mo.');
        return;
      }
      setState(() => _fichier = fichier);
    } catch (_) {
      if (!mounted) return;
      Message.erreur(
        context,
        'Accès refusé',
        'Autorisez l’appareil photo ou la galerie pour envoyer une preuve.',
      );
    }
  }

  Future<void> _envoyer() async {
    final fichier = _fichier;
    if (fichier == null || _envoi) return;
    setState(() {
      _envoi = true;
      _progression = 0;
    });

    final r = await PreuvesService.televerser(
      widget.matchId,
      fichier: fichier,
      type: _type,
      surProgression: (valeur) {
        if (mounted) setState(() => _progression = valeur);
      },
    );

    if (!mounted) return;
    setState(() {
      _envoi = false;
      _progression = 0;
    });

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(
        context,
        echec.statut == 409 ? 'Preuve déjà utilisée' : 'Envoi impossible',
        echec.message,
      );
      return;
    }

    setState(() => _fichier = null);
    Message.succes(
      context,
      'Preuve envoyée',
      _estVideo
          ? 'Vidéo enregistrée, en attente de vérification.'
          : 'Capture enregistrée, en attente de vérification.',
    );
    widget.onEnvoye();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'capture_ecran',
                label: Text('Capture'),
                icon: Icon(Icons.image_outlined, size: 18),
              ),
              ButtonSegment(
                value: 'video',
                label: Text('Vidéo'),
                icon: Icon(Icons.videocam_outlined, size: 18),
              ),
            ],
            selected: {_type},
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(
              backgroundColor: Couleurs.papier,
              foregroundColor: Couleurs.muet,
              selectedBackgroundColor: Couleurs.vertPale,
              selectedForegroundColor: Couleurs.vert,
              side: const BorderSide(color: Couleurs.trait),
              textStyle: Typo.legendeForte,
            ),
            onSelectionChanged: _envoi
                ? null
                : (choix) => setState(() {
                      _type = choix.first;
                      _fichier = null;
                    }),
          ),
          const SizedBox(height: 14),
          if (_fichier != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Couleurs.gris,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(_estVideo ? Icons.movie_outlined : Icons.image_outlined,
                      size: 20, color: Couleurs.vert),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _fichier!.uri.pathSegments.last,
                      style: Typo.legende,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (!_envoi)
                    IconButton(
                      onPressed: () => setState(() => _fichier = null),
                      icon: const Icon(Icons.close, size: 18),
                      color: Couleurs.muet,
                      tooltip: 'Retirer le fichier',
                    ),
                ],
              ),
            )
          else
            Row(
              children: [
                Expanded(
                  child: Bouton(
                    // « Photographier » ne tient pas dans une demi-largeur de 375 px.
                    libelle: _estVideo ? 'Filmer' : 'Photo',
                    variante: VarianteBouton.secondaire,
                    icone: Icons.photo_camera_outlined,
                    onPressed: _envoi ? null : () => _choisir(appareilPhoto: true),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Bouton(
                    libelle: 'Galerie',
                    variante: VarianteBouton.secondaire,
                    icone: Icons.perm_media_outlined,
                    onPressed: _envoi ? null : () => _choisir(appareilPhoto: false),
                  ),
                ),
              ],
            ),
          if (_envoi) ...[
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: _progression == 0 ? null : _progression,
                minHeight: 6,
                backgroundColor: Couleurs.gris,
                color: Couleurs.vert,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Envoi en cours… ${(_progression * 100).round()} %',
              style: Typo.petit,
            ),
          ],
          if (_fichier != null && !_envoi) ...[
            const SizedBox(height: 12),
            Bouton(
              libelle: 'Envoyer la preuve',
              bloc: true,
              variante: VarianteBouton.volt,
              icone: Icons.cloud_upload_outlined,
              onPressed: _envoyer,
            ),
          ],
          const SizedBox(height: 10),
          Text(
            'Capture (jpg, png, webp, heic) ou vidéo (mp4, mov, webm, mkv), 50 Mo max. '
            'Une preuve déjà utilisée pour un autre match est refusée.',
            style: Typo.petit,
          ),
        ],
      ),
    );
  }
}

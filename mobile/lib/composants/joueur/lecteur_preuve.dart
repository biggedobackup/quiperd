import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../modeles/preuve_match.modele.dart';
import '../../noyau/format.dart';
import '../../noyau/statuts.dart';
import '../../services/preuves.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/badge_statut.dart';

/// Lecture d'une preuve déposée.
///
/// Le fichier passe par la route **authentifiée** `GET /api/preuves/:id/fichier` :
/// l'en-tête `Authorization` est joint à la requête image comme au lecteur
/// vidéo. Il n'existe aucune URL publique vers une preuve.
class LecteurPreuve extends StatelessWidget {
  const LecteurPreuve({super.key, required this.preuve, required this.auteur});

  final PreuveMatch preuve;
  final String auteur;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 16 / 10,
            child: preuve.estVideo
                ? _Video(preuveId: preuve.id)
                : _Image(preuveId: preuve.id),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  preuve.estVideo ? Icons.movie_outlined : Icons.image_outlined,
                  size: 16,
                  color: Couleurs.muet,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(auteur,
                          style: Typo.legendeForte,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      Text(formatDateRelative(preuve.dateCreation), style: Typo.petit),
                    ],
                  ),
                ),
                BadgeStatut(famille: FamilleStatut.preuve, valeur: preuve.statut, compact: true),
              ],
            ),
          ),
          if (preuve.statut == 'rejetee' && preuve.motifRejet.isNotEmpty)
            Container(
              width: double.infinity,
              color: Couleurs.perteFond,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                'Rejetée : ${preuve.motifRejet}',
                style: Typo.petit.copyWith(color: Couleurs.perte),
              ),
            ),
        ],
      ),
    );
  }
}

class _Image extends StatelessWidget {
  const _Image({required this.preuveId});

  final String preuveId;

  @override
  Widget build(BuildContext context) {
    return Image.network(
      PreuvesService.urlFichier(preuveId),
      headers: PreuvesService.entetesFichier,
      fit: BoxFit.cover,
      loadingBuilder: (context, enfant, progression) =>
          progression == null ? enfant : const _Attente(),
      errorBuilder: (context, _, _) => const _Indisponible(texte: 'Image indisponible'),
    );
  }
}

/// Lecteur vidéo minimal : première image, bouton lecture/pause, barre de
/// progression. On ne charge la vidéo qu'à la demande — une preuve peut peser
/// des dizaines de mégaoctets et le joueur est souvent en données mobiles.
class _Video extends StatefulWidget {
  const _Video({required this.preuveId});

  final String preuveId;

  @override
  State<_Video> createState() => _VideoState();
}

class _VideoState extends State<_Video> {
  VideoPlayerController? _controleur;
  bool _chargement = false;
  bool _erreur = false;

  Future<void> _charger() async {
    if (_chargement || _controleur != null) return;
    setState(() => _chargement = true);
    final controleur = VideoPlayerController.networkUrl(
      Uri.parse(PreuvesService.urlFichier(widget.preuveId)),
      httpHeaders: PreuvesService.entetesFichier,
    );
    try {
      await controleur.initialize();
      if (!mounted) {
        await controleur.dispose();
        return;
      }
      setState(() {
        _controleur = controleur;
        _chargement = false;
      });
      await controleur.play();
    } catch (_) {
      await controleur.dispose();
      if (!mounted) return;
      setState(() {
        _chargement = false;
        _erreur = true;
      });
    }
  }

  @override
  void dispose() {
    _controleur?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_erreur) return const _Indisponible(texte: 'Vidéo indisponible');
    if (_chargement) return const _Attente();

    final controleur = _controleur;
    if (controleur == null) {
      return Material(
        color: Couleurs.encre,
        child: InkWell(
          onTap: _charger,
          child: const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.play_circle_outline, color: Couleurs.craie, size: 44),
                SizedBox(height: 8),
                Text('Lire la vidéo', style: TextStyle(color: Couleurs.craie, fontSize: 12)),
              ],
            ),
          ),
        ),
      );
    }

    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Positioned.fill(
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: controleur.value.size.width,
              height: controleur.value.size.height,
              child: VideoPlayer(controleur),
            ),
          ),
        ),
        Positioned.fill(
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => setState(
                () => controleur.value.isPlaying ? controleur.pause() : controleur.play(),
              ),
              child: Center(
                child: controleur.value.isPlaying
                    ? const SizedBox.shrink()
                    : const Icon(Icons.play_arrow, color: Couleurs.craie, size: 44),
              ),
            ),
          ),
        ),
        VideoProgressIndicator(
          controleur,
          allowScrubbing: true,
          colors: const VideoProgressColors(
            playedColor: Couleurs.volt,
            bufferedColor: Couleurs.muet,
            backgroundColor: Couleurs.encre,
          ),
        ),
      ],
    );
  }
}

class _Attente extends StatelessWidget {
  const _Attente();

  @override
  Widget build(BuildContext context) => const ColoredBox(
        color: Couleurs.gris,
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
}

class _Indisponible extends StatelessWidget {
  const _Indisponible({required this.texte});

  final String texte;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: Couleurs.gris,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.broken_image_outlined, color: Couleurs.muet),
              const SizedBox(height: 6),
              Text(texte, style: Typo.petit),
            ],
          ),
        ),
      );
}

import 'package:flutter/material.dart';

import '../../noyau/format.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/bouton.dart';
import 'compte_a_rebours.dart';

/// Cadre commun des panneaux d'action du match : même gabarit, même place en
/// haut de l'écran, pour qu'un joueur retrouve toujours au même endroit ce que
/// le jeu attend de lui.
class _Panneau extends StatelessWidget {
  const _Panneau({
    required this.etiquette,
    required this.titre,
    required this.texte,
    required this.couleur,
    required this.fond,
    this.enfants = const [],
  });

  final String etiquette;
  final String titre;
  final String texte;
  final Color couleur;
  final Color fond;
  final List<Widget> enfants;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: fond,
        border: Border.all(color: couleur),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(etiquette.toUpperCase(),
              style: Typo.etiquette.copyWith(color: couleur, fontSize: 10)),
          const SizedBox(height: 10),
          Text(titre, style: Typo.h3),
          const SizedBox(height: 6),
          Text(texte, style: Typo.legende.copyWith(color: Couleurs.muet)),
          ...enfants,
        ],
      ),
    );
  }
}

/// J'ai déclaré, l'adversaire pas encore.
class PanneauAttente extends StatelessWidget {
  const PanneauAttente({
    super.key,
    required this.nomAdversaire,
    this.echeance,
    this.surFinChrono,
  });

  final String nomAdversaire;
  final String? echeance;
  final VoidCallback? surFinChrono;

  @override
  Widget build(BuildContext context) {
    return _Panneau(
      etiquette: 'En attente',
      titre: 'Votre résultat est déclaré',
      texte: '$nomAdversaire doit maintenant confirmer ou annoncer l’inverse.',
      couleur: Couleurs.info,
      fond: Couleurs.infoFond,
      enfants: [
        if (echeance != null) ...[
          const SizedBox(height: 16),
          BlocCompteARebours(
            echeance: echeance!,
            consequence: 'Sans réponse de sa part, la victoire vous revient.',
            surFin: surFinChrono,
          ),
        ],
      ],
    );
  }
}

/// Les deux joueurs ont déclaré une égalité : rejouer ou partager.
class PanneauNul extends StatelessWidget {
  const PanneauNul({
    super.key,
    required this.nomAdversaire,
    required this.onOuvrir,
    this.monChoix,
    this.choixAdverse,
    this.echeance,
    this.surFinChrono,
  });

  final String nomAdversaire;
  final VoidCallback onOuvrir;
  final String? monChoix;
  final String? choixAdverse;
  final String? echeance;
  final VoidCallback? surFinChrono;

  String get _texte {
    if (monChoix == null) {
      return choixAdverse == null
          ? 'Match nul déclaré des deux côtés. Rejouer la manche ne coûte rien ; '
              'partager rend à chacun sa mise, moins la commission.'
          : '$nomAdversaire a choisi « ${_libelle(choixAdverse!)} ». À vous de choisir.';
    }
    return choixAdverse == null
        ? 'Vous avez choisi « ${_libelle(monChoix!)} ». En attente de $nomAdversaire.'
        : 'Les deux choix sont enregistrés. Le serveur applique la suite.';
  }

  static String _libelle(String choix) => choix == 'rejouer' ? 'rejouer' : 'partager';

  @override
  Widget build(BuildContext context) {
    return _Panneau(
      etiquette: 'Match nul',
      titre: 'Rejouer ou partager ?',
      texte: _texte,
      couleur: Couleurs.alerte,
      fond: Couleurs.alerteFond,
      enfants: [
        if (echeance != null) ...[
          const SizedBox(height: 16),
          BlocCompteARebours(
            echeance: echeance!,
            consequence: 'Sans choix des deux côtés, l’escrow est partagé automatiquement.',
            surFin: surFinChrono,
          ),
        ],
        if (monChoix == null) ...[
          const SizedBox(height: 16),
          Bouton(
            libelle: 'Faire mon choix',
            bloc: true,
            taille: TailleBouton.lg,
            variante: VarianteBouton.volt,
            icone: Icons.balance,
            onPressed: onOuvrir,
          ),
        ],
      ],
    );
  }
}

/// Les déclarations divergent : preuve exigée des deux côtés.
class PanneauPreuveRequise extends StatelessWidget {
  const PanneauPreuveRequise({
    super.key,
    required this.nomAdversaire,
    required this.jaiEnvoye,
    required this.adversaireAEnvoye,
    required this.zoneEnvoi,
    this.echeance,
    this.surFinChrono,
  });

  final String nomAdversaire;
  final bool jaiEnvoye;
  final bool adversaireAEnvoye;

  /// Le composant d'envoi est injecté : le panneau ne connaît pas l'API.
  final Widget zoneEnvoi;
  final String? echeance;
  final VoidCallback? surFinChrono;

  @override
  Widget build(BuildContext context) {
    return _Panneau(
      etiquette: 'Preuve exigée',
      titre: 'Vos déclarations ne concordent pas',
      texte: 'Envoyez chacun une preuve (capture ou vidéo de fin de match) avant '
          'l’échéance. Un arbitre tranchera ensuite.',
      couleur: Couleurs.alerte,
      fond: Couleurs.alerteFond,
      enfants: [
        const SizedBox(height: 14),
        _Etat(fait: jaiEnvoye, texte: jaiEnvoye ? 'Votre preuve est envoyée' : 'Votre preuve manque'),
        const SizedBox(height: 6),
        _Etat(
          fait: adversaireAEnvoye,
          texte: adversaireAEnvoye
              ? 'Preuve de $nomAdversaire reçue'
              : 'Preuve de $nomAdversaire attendue',
        ),
        if (echeance != null) ...[
          const SizedBox(height: 16),
          BlocCompteARebours(
            echeance: echeance!,
            consequence: 'À l’échéance, le match part en litige et un arbitre décide.',
            surFin: surFinChrono,
          ),
        ],
        const SizedBox(height: 16),
        zoneEnvoi,
      ],
    );
  }
}

class _Etat extends StatelessWidget {
  const _Etat({required this.fait, required this.texte});

  final bool fait;
  final String texte;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          fait ? Icons.check_circle : Icons.radio_button_unchecked,
          size: 16,
          color: fait ? Couleurs.gain : Couleurs.muet,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            texte,
            style: Typo.legende.copyWith(color: fait ? Couleurs.gain : Couleurs.muet),
          ),
        ),
      ],
    );
  }
}

/// Un litige est ouvert : plus rien à faire que d'attendre l'arbitre.
class PanneauLitige extends StatelessWidget {
  const PanneauLitige({super.key, required this.onVoirLitiges});

  final VoidCallback onVoirLitiges;

  @override
  Widget build(BuildContext context) {
    return _Panneau(
      etiquette: 'Litige',
      titre: 'Arbitrage en cours',
      texte: 'Les deux mises restent bloquées jusqu’à la décision. L’arbitre règle le '
          'match au gagnant ou rend leur mise aux deux joueurs, moins la commission.',
      couleur: Couleurs.perte,
      fond: Couleurs.perteFond,
      enfants: [
        const SizedBox(height: 14),
        Bouton(
          libelle: 'Suivre mes litiges',
          variante: VarianteBouton.secondaire,
          icone: Icons.gavel_outlined,
          onPressed: onVoirLitiges,
        ),
      ],
    );
  }
}

/// Consigne cochée de la carte « Que faire maintenant ? ».
class Consigne extends StatelessWidget {
  const Consigne({super.key, required this.fait, required this.texte});

  final bool fait;
  final String texte;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            fait ? Icons.check_circle : Icons.radio_button_unchecked,
            size: 16,
            color: fait ? Couleurs.gain : Couleurs.muet,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              texte,
              style: Typo.legende.copyWith(
                color: fait ? Couleurs.muet : Couleurs.encre,
                decoration: fait ? TextDecoration.lineThrough : null,
                decorationColor: Couleurs.muet,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Résumé de l'enjeu, réutilisé par la fiche de défi et l'écran de match.
class LigneEnjeu extends StatelessWidget {
  const LigneEnjeu({
    super.key,
    required this.libelle,
    required this.valeur,
    this.fort = false,
    this.clair = true,
  });

  final String libelle;
  final String valeur;
  final bool fort;
  final bool clair;

  @override
  Widget build(BuildContext context) {
    final couleurLibelle = clair
        ? Couleurs.craie.withValues(alpha: fort ? 1 : 0.7)
        : (fort ? Couleurs.encre : Couleurs.muet);
    final couleurValeur = clair ? Couleurs.craie : Couleurs.encre;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(
              libelle,
              style: (fort ? Typo.legendeForte : Typo.legende).copyWith(color: couleurLibelle),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            valeur,
            style: Typo.chiffres(taille: 13, poids: fort ? 700 : 400, couleur: couleurValeur),
          ),
        ],
      ),
    );
  }
}

/// Récapitulatif d'enjeu (mise, total en séquestre, commission, gain estimé).
class RecapitulatifEnjeu extends StatelessWidget {
  const RecapitulatifEnjeu({
    super.key,
    required this.mise,
    required this.devise,
    required this.tauxCommission,
    this.titre = 'Récapitulatif',
    this.gainEstime = true,
  });

  final double mise;
  final String devise;
  final double tauxCommission;
  final String titre;
  final bool gainEstime;

  @override
  Widget build(BuildContext context) {
    final total = mise * 2;
    final commission = total * tauxCommission;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Couleurs.encre,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titre.toUpperCase(),
              style: Typo.etiquette.copyWith(
                  color: Couleurs.craie.withValues(alpha: 0.6), fontSize: 10)),
          const SizedBox(height: 14),
          LigneEnjeu(libelle: 'Votre mise (bloquée)', valeur: formatMontant(mise, devise)),
          LigneEnjeu(libelle: 'Mise de l’adversaire', valeur: formatMontant(mise, devise)),
          LigneEnjeu(
            libelle: 'Total en séquestre',
            valeur: formatMontant(total, devise),
            fort: true,
          ),
          LigneEnjeu(
            libelle: 'Commission (${formatPourcentage(tauxCommission)})',
            valeur: '− ${formatMontant(commission, devise)}',
          ),
          if (gainEstime) ...[
            const SizedBox(height: 6),
            Divider(color: Couleurs.craie.withValues(alpha: 0.15)),
            const SizedBox(height: 10),
            Text('GAIN ESTIMÉ SI VOUS GAGNEZ',
                style: Typo.etiquette.copyWith(
                    color: Couleurs.craie.withValues(alpha: 0.6), fontSize: 10)),
            const SizedBox(height: 4),
            Text(
              formatMontant(total - commission, devise),
              style: Typo.chiffres(taille: 26, poids: 700, couleur: Couleurs.volt),
            ),
            const SizedBox(height: 6),
            Text(
              'Estimation au taux actuel ; le montant réel est calculé par la '
              'plateforme au règlement.',
              style: Typo.petit.copyWith(color: Couleurs.craie.withValues(alpha: 0.5)),
            ),
          ],
        ],
      ),
    );
  }
}

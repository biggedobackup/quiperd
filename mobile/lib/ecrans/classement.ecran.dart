import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/squelette.dart';
import '../etats/session.etat.dart';
import '../modeles/ligne_classement.modele.dart';
import '../noyau/format.dart';
import '../noyau/resultat.dart';
import '../services/classement.service.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';

/// Classement des joueurs, par gains **réellement crédités** sur la période.
///
/// Le tableau est recalculé à la lecture par le serveur : rien n'est agrégé
/// côté mobile. Si le joueur connecté n'est pas dans le haut du tableau, sa
/// ligne est épinglée en bas — sans quoi un joueur classé 32e n'aurait aucun
/// moyen de se situer.
class ClassementEcran extends StatefulWidget {
  const ClassementEcran({super.key});

  @override
  State<ClassementEcran> createState() => _ClassementEcranState();
}

class _ClassementEcranState extends State<ClassementEcran> {
  String _periode = 'general';
  Classement _classement = Classement.vide;
  bool _chargement = true;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    if (!mounted) return;
    setState(() => _chargement = true);
    final r = await ClassementService.lire(periode: _periode);
    if (!mounted) return;
    if (r is Succes<Classement>) _classement = r.donnees;
    setState(() => _chargement = false);
  }

  @override
  Widget build(BuildContext context) {
    final moiId = context.watch<SessionEtat>().utilisateur?.id ?? '';

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Classement')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _charger,
          color: Couleurs.vert,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              const EnTetePage(
                surtitre: 'Palmarès',
                titre: 'Classement',
                description: 'Classé par gains réellement crédités — pas par mises engagées.',
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: ClassementService.periodes.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final periode = ClassementService.periodes[i];
                    final actif = periode == _periode;
                    return _Puce(
                      libelle: ClassementService.libellesPeriodes[periode] ?? periode,
                      actif: actif,
                      onTap: () {
                        setState(() => _periode = periode);
                        _charger();
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 18),
              if (_chargement)
                const SqueletteDiffere(child: SqueletteCartes(nombre: 5, hauteur: 64))
              else if (_classement.elements.isEmpty)
                const EtatVide(
                  icone: Icons.leaderboard_outlined,
                  titre: 'Classement vide',
                  description: 'Aucun match n’a encore été réglé sur cette période.',
                )
              else ...[
                ..._classement.elements.map(
                  (l) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _Ligne(ligne: l, moi: l.utilisateurId == moiId),
                  ),
                ),
                if (_classement.moi != null) ...[
                  const SizedBox(height: 16),
                  Text('VOTRE POSITION',
                      style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
                  const SizedBox(height: 8),
                  _Ligne(ligne: _classement.moi!, moi: true),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne({required this.ligne, required this.moi});

  final LigneClassement ligne;
  final bool moi;

  Color get _couleurRang => switch (ligne.rang) {
        1 => Couleurs.vert,
        2 || 3 => Couleurs.encre,
        _ => Couleurs.muet,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: moi ? Couleurs.vertPale : Couleurs.papier,
        border: Border.all(color: moi ? Couleurs.vert : Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 34,
            child: Text(
              '${ligne.rang}',
              textAlign: TextAlign.center,
              style: Typo.chiffres(taille: 16, poids: 700, couleur: _couleurRang),
            ),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(color: Couleurs.encre, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: Text(
              monogramme(ligne.nomUtilisateur),
              style: Typo.chiffres(taille: 12, poids: 700, couleur: Couleurs.craie),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  moi ? '${ligne.nomUtilisateur} (vous)' : ligne.nomUtilisateur,
                  style: Typo.legendeForte,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${ligne.victoires} ${pluriel(ligne.victoires, 'victoire')} '
                  'sur ${ligne.matchs} ${pluriel(ligne.matchs, 'match', 'matchs')}'
                  '${ligne.pays.isNotEmpty ? ' · ${ligne.pays}' : ''}',
                  style: Typo.petit,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            formatMontant(ligne.gains, ligne.devise),
            style: Typo.chiffres(taille: 13, poids: 700, couleur: Couleurs.gain),
          ),
        ],
      ),
    );
  }
}

class _Puce extends StatelessWidget {
  const _Puce({required this.libelle, required this.actif, required this.onTap});

  final String libelle;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: actif ? Couleurs.vert : Couleurs.papier,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          decoration: BoxDecoration(
            border: Border.all(color: actif ? Couleurs.vert : Couleurs.trait),
            borderRadius: BorderRadius.circular(999),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Center(
            child: Text(
              libelle.toUpperCase(),
              style: Typo.etiquette.copyWith(
                fontSize: 10,
                color: actif ? Couleurs.craie : Couleurs.muet,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

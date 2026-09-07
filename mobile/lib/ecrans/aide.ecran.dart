import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/bouton.dart';
import '../composants/communs/champ_texte.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/message.dart';
import '../etats/catalogue.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/regles_financieres.modele.dart';
import '../noyau/format.dart';
import '../noyau/resultat.dart';
import '../noyau/validateurs.dart';
import '../services/contact.service.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';

/// Aide : FAQ et formulaire de contact.
///
/// Les montants et la commission des réponses viennent de l'API
/// (`GET /api/configurations-financieres`) : **jamais un pourcentage codé en
/// dur** dans un texte, sans quoi la FAQ mentirait dès la première modification
/// faite depuis l'administration.
class AideEcran extends StatefulWidget {
  const AideEcran({super.key});

  @override
  State<AideEcran> createState() => _AideEcranState();
}

class _AideEcranState extends State<AideEcran> {
  final _cle = GlobalKey<FormState>();
  final _nom = TextEditingController();
  final _email = TextEditingController();
  final _sujet = TextEditingController();
  final _message = TextEditingController();
  bool _envoi = false;

  @override
  void initState() {
    super.initState();
    // Préremplissage pour un joueur connecté : il ne doit pas retaper ce que
    // l'application connaît déjà.
    final moi = context.read<SessionEtat>().utilisateur;
    _nom.text = moi?.nomUtilisateur ?? '';
    _email.text = moi?.email ?? '';
  }

  @override
  void dispose() {
    _nom.dispose();
    _email.dispose();
    _sujet.dispose();
    _message.dispose();
    super.dispose();
  }

  /// Copie IDENTIQUE à celle du site (`components/public/faq-accordion.tsx`) :
  /// mêmes questions, mêmes réponses, mêmes chiffres lus sur l'API. Une FAQ qui
  /// diverge d'un client à l'autre finit par mentir à l'un des deux.
  List<({String question, String reponse})> _questions(ReglesFinancieres regles) => [
        (
          question: 'Comment mon argent est-il protégé pendant un match ?',
          reponse: 'Dès qu’un défi est créé ou rejoint, la mise quitte le solde disponible '
              'pour le solde bloqué (séquestre). Elle n’en sort qu’au règlement du match, à '
              'l’annulation d’un défi non rejoint ou sur décision d’un arbitre.',
        ),
        (
          question: 'Combien puis-je miser ?',
          reponse: 'Entre ${formatMontant(regles.miseMinimale)} et '
              '${formatMontant(regles.miseMaximale)} par joueur et par défi. Ces bornes sont '
              'fixées par l’équipe Défis en Ligne et peuvent évoluer.',
        ),
        (
          question: 'Que gagne le vainqueur ?',
          reponse: 'Les deux mises additionnées, moins la commission de la plateforme '
              '(${formatPourcentage(regles.commissionDefi)} du total). Exemple : deux mises de '
              '${formatMontant(2000)} donnent un total de ${formatMontant(4000)}, le gagnant '
              'reçoit ${formatMontant(4000 - 4000 * regles.commissionDefi)}.',
        ),
        (
          question: 'Que se passe-t-il si les deux joueurs déclarent des résultats contraires ?',
          reponse: 'Le match passe automatiquement en litige. Les mises restent bloquées, un '
              'arbitre examine les preuves (captures, vidéos) et tranche : règlement au gagnant '
              'qu’il désigne, ou remboursement des deux joueurs (chaque mise rendue moins la '
              'commission).',
        ),
        (
          question: 'Comment déposer et retirer de l’argent ?',
          reponse: 'Par Mobile Money via LigdiCash ou MoneyFusion. Le dépôt est crédité dès '
              'confirmation du prestataire. Le retrait est débité immédiatement du solde '
              'disponible avec ${formatPourcentage(regles.fraisRetrait)} de frais, acquis '
              'seulement si le retrait aboutit : en cas d’échec, montant et frais sont recrédités.',
        ),
        (
          question: 'Personne ne rejoint mon défi, que devient ma mise ?',
          reponse: 'Un défi ouvert expire à la fin de la durée choisie (24 h par défaut). Votre '
              'mise vous est alors rendue en totalité sur votre solde disponible : sans '
              'adversaire, aucune commission n’est prélevée. Vous pouvez aussi annuler un défi '
              'encore ouvert à tout moment.',
        ),
        (
          question: 'Puis-je jouer sur mobile ?',
          reponse: 'Oui : l’espace joueur du site fonctionne sur téléphone, et une application '
              'mobile Défis en Ligne utilise la même plateforme. Vos défis, votre portefeuille et vos '
              'notifications sont identiques partout.',
        ),
      ];

  Future<void> _envoyer() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);

    final r = await ContactService.envoyer(
      nom: _nom.text.trim(),
      email: _email.text.trim(),
      sujet: _sujet.text.trim(),
      message: _message.text.trim(),
    );
    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec<void>) {
      Message.erreur(
        context,
        r.statut == 429 ? 'Trop de messages' : 'Envoi impossible',
        r.statut == 429
            ? 'Vous avez déjà envoyé plusieurs messages récemment. Réessayez dans une heure.'
            : r.message,
      );
      return;
    }
    _sujet.clear();
    _message.clear();
    Message.succes(context, 'Message envoyé', 'Notre équipe vous répondra par e-mail.');
  }

  @override
  Widget build(BuildContext context) {
    final regles = context.watch<CatalogueEtat>().regles;

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Aide & contact')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            const EnTetePage(
              surtitre: 'Aide',
              titre: 'Tout ce qu’il faut savoir avant de miser.',
            ),
            const SizedBox(height: 22),
            Text('QUESTIONS FRÉQUENTES',
                style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
            const SizedBox(height: 12),
            ..._questions(regles).indexed.map(
              (paire) => _Question(
                numero: paire.$1 + 1,
                question: paire.$2.question,
                reponse: paire.$2.reponse,
              ),
            ),
            const SizedBox(height: 22),
            const Encart(
              icone: Icons.mail_outline,
              texte: 'Une question précise ? Écrivez-nous depuis le formulaire ci-dessous ou '
                  'par courriel : support@quiperd.com. L’équipe répond par e-mail, du lundi au '
                  'samedi.',
            ),
            const SizedBox(height: 12),
            const Encart(
              ton: TonMessage.attention,
              icone: Icons.gavel_outlined,
              texte: 'Litige en cours ? Ouvrez l’écran du match : vos preuves et la décision de '
                  'l’arbitre s’y trouvent.',
            ),
            const SizedBox(height: 28),
            Text('Nous contacter', style: Typo.h3),
            const SizedBox(height: 4),
            Text(
              'Une question précise ? Écrivez-nous, nous répondons par e-mail.',
              style: Typo.legende.copyWith(color: Couleurs.muet),
            ),
            const SizedBox(height: 18),
            Form(
              key: _cle,
              child: Column(
                children: [
                  ChampTexte(
                    controleur: _nom,
                    label: 'Votre nom',
                    placeholder: 'Ex. Kader',
                    validateur: (v) => (v ?? '').trim().length < 2
                        ? 'Au moins 2 caractères'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _email,
                    label: 'Votre e-mail',
                    placeholder: 'vous@exemple.com',
                    clavier: TextInputType.emailAddress,
                    validateur: validerEmail,
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _sujet,
                    label: 'Sujet',
                    placeholder: 'Ex. dépôt non crédité, question sur un litige',
                    longueurMax: 150,
                    validateur: (v) => (v ?? '').trim().length < 3
                        ? 'Au moins 3 caractères'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  ChampTexte(
                    controleur: _message,
                    label: 'Message',
                    lignes: 5,
                    longueurMax: 2000,
                    onChanged: (_) => setState(() {}),
                    validateur: (v) => (v ?? '').trim().length < 10
                        ? 'Décrivez votre demande (10 caractères minimum)'
                        : null,
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text('${_message.text.length} / 2000 caractères', style: Typo.petit),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Ne communiquez jamais votre mot de passe : l’équipe ne vous le demandera pas.',
                    style: Typo.petit,
                  ),
                  const SizedBox(height: 16),
                  Bouton(
                    libelle: 'Envoyer',
                    bloc: true,
                    taille: TailleBouton.lg,
                    variante: VarianteBouton.volt,
                    icone: Icons.send_outlined,
                    chargement: _envoi,
                    onPressed: _envoyer,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Question extends StatelessWidget {
  const _Question({required this.numero, required this.question, required this.reponse});

  final int numero;
  final String question;
  final String reponse;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                numero.toString().padLeft(2, '0'),
                style: Typo.chiffres(taille: 11, poids: 700, couleur: Couleurs.vert),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(question, style: Typo.legendeForte)),
            ],
          ),
          iconColor: Couleurs.vert,
          collapsedIconColor: Couleurs.muet,
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(reponse, style: Typo.legende.copyWith(color: Couleurs.muet)),
          ],
        ),
      ),
    );
  }
}

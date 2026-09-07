/**
 * Registre Font Awesome : chaque icône est importée individuellement (tree-shaking) et
 * nommée par son usage métier. Aucun `library.add(fas)` — le bundle resterait léger.
 */
import { config } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowRightArrowLeft,
  faArrowUp,
  faBan,
  faBars,
  faBell,
  faBolt,
  faBook,
  faCarSide,
  faChartSimple,
  faCheck,
  faCheckDouble,
  faChessKnight,
  faCommentDots,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCircleDot,
  faCircleInfo,
  faCircleQuestion,
  faCircleXmark,
  faClock,
  faCoins,
  faCrosshairs,
  faCrown,
  faDesktop,
  faDiamond,
  faEnvelope,
  faEye,
  faEyeSlash,
  faFilter,
  faFlagCheckered,
  faFutbol,
  faGamepad,
  faGavel,
  faGear,
  faGhost,
  faGlobe,
  faHandFist,
  faInbox,
  faHandshake,
  faHouse,
  faHourglassHalf,
  faImage,
  faKey,
  faLayerGroup,
  faListCheck,
  faLock,
  faMagnifyingGlass,
  faMobileScreenButton,
  faMoneyBillTransfer,
  faPaperPlane,
  faPenToSquare,
  faPhone,
  faPlus,
  faReply,
  faRightFromBracket,
  faRotateRight,
  faScaleBalanced,
  faShieldHalved,
  faSliders,
  faSpinner,
  faTableList,
  faTicket,
  faTrash,
  faTriangleExclamation,
  faTrophy,
  faUpload,
  faUser,
  faUserCheck,
  faUserPlus,
  faUserSlash,
  faUsers,
  faVideo,
  faWallet,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { faPlaystation, faSteam, faWindows, faXbox } from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

// Le CSS de fontawesome est importé dans styles/app.css : on désactive l'injection automatique
// (sinon flash d'icônes géantes au premier rendu serveur).
config.autoAddCss = false

export const icone = {
  // navigation
  accueil: faHouse,
  menu: faBars,
  fermer: faXmark,
  suivant: faArrowRight,
  precedent: faArrowLeft,
  chevronBas: faChevronDown,
  chevronDroite: faChevronRight,
  chevronGauche: faChevronLeft,
  deconnexion: faRightFromBracket,
  // métier
  defi: faBolt,
  match: faFlagCheckered,
  trophee: faTrophy,
  couronne: faCrown,
  litige: faScaleBalanced,
  arbitrage: faGavel,
  portefeuille: faWallet,
  pieces: faCoins,
  transfert: faMoneyBillTransfer,
  depot: faArrowDown,
  retrait: faArrowUp,
  echange: faArrowRightArrowLeft,
  notification: faBell,
  profil: faUser,
  utilisateurs: faUsers,
  jeu: faGamepad,
  catalogue: faLayerGroup,
  preuve: faImage,
  video: faVideo,
  televerser: faUpload,
  securite: faShieldHalved,
  cadenas: faLock,
  cle: faKey,
  ticket: faTicket,
  poigneeDeMain: faHandshake,
  // catégories de jeu (charte API : sport, combat, course, tir, strategie, cartes, arcade)
  sport: faFutbol,
  combat: faHandFist,
  course: faCarSide,
  tir: faCrosshairs,
  strategie: faChessKnight,
  cartes: faDiamond,
  arcade: faGhost,
  // familles de plateforme
  console: faGamepad,
  mobile: faMobileScreenButton,
  ecran: faDesktop,
  // états / actions
  valider: faCheck,
  succes: faCircleCheck,
  erreur: faCircleXmark,
  info: faCircleInfo,
  aide: faCircleQuestion,
  attention: faTriangleExclamation,
  chargement: faSpinner,
  horloge: faClock,
  sablier: faHourglassHalf,
  point: faCircleDot,
  ajouter: faPlus,
  rechercher: faMagnifyingGlass,
  filtrer: faFilter,
  rafraichir: faRotateRight,
  interdire: faBan,
  suspendre: faUserSlash,
  reactiver: faUserCheck,
  parametres: faGear,
  reglages: faSliders,
  voir: faEye,
  masquer: faEyeSlash,
  envoyer: faPaperPlane,
  courriel: faEnvelope,
  // contact & gestion des comptes (admin)
  messages: faInbox,
  message: faCommentDots,
  repondre: faReply,
  traite: faCheckDouble,
  telephone: faPhone,
  pays: faGlobe,
  ajouterUtilisateur: faUserPlus,
  modifier: faPenToSquare,
  supprimer: faTrash,
  livre: faBook,
  liste: faListCheck,
  tableau: faTableList,
  statistiques: faChartSimple,
  // marques (plateformes)
  playstation: faPlaystation,
  xbox: faXbox,
  pc: faWindows,
  steam: faSteam,
} satisfies Record<string, IconDefinition>

export type NomIcone = keyof typeof icone

/**
 * Icône d'une plateforme du catalogue : marque reconnue dans le nom (PlayStation, Xbox, PC…),
 * sinon icône de sa famille (pc, console, mobile).
 */
export function iconePlateforme(nom: string, famille?: string): IconDefinition {
  const n = nom.toLowerCase()
  if (n.includes('play')) return icone.playstation
  if (n.includes('xbox')) return icone.xbox
  if (n.includes('steam')) return icone.steam
  if (n.includes('windows') || n === 'pc' || n.startsWith('pc ')) return icone.pc
  if (famille === 'mobile' || n.includes('mobile') || n.includes('android') || n.includes('ios')) return icone.mobile
  if (famille === 'pc') return icone.pc
  if (famille === 'console' || n.includes('switch') || n.includes('nintendo')) return icone.console
  return icone.ecran
}

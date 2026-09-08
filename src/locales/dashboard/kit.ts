import type { KitStatus } from '@/lib/kit-orders'
import type { KitFormula } from '@/lib/kit-snapshot'

/**
 * Onglet « Kit sur mesure » — surface UTILISATEUR FINAL (lot 2).
 *
 * ⚠️ Ne pas confondre avec `admin.kits`, qui est le sous-onglet du panneau
 * d'administration. Les deux parlent du même dossier mais à deux publics, et
 * c'est pour ça qu'ils ne partagent pas leurs libellés :
 *
 *   • `admin.kits.statuses` nomme l'ÉTAT INTERNE (« Découverte faite ») — c'est
 *     ce dont l'admin a besoin pour piloter la machine à 8 états ;
 *   • `kit.progress` ci-dessous dit au CLIENT où il en est et ce qui se passe
 *     ensuite (« On a fait le point ensemble. On réfléchit à ton kit. »).
 *
 * Ce ne sont donc PAS les mêmes chaînes dupliquées : ce sont deux registres
 * différents pour la même valeur de `kit_orders.status`. Les fusionner
 * obligerait l'un des deux publics à lire le vocabulaire de l'autre.
 */

/* ── Formules ─────────────────────────────────────────────────────────────── */

const formulasFr: Record<KitFormula, { name: string; who: string }> = {
  solo: { name: 'Solo',  who: 'Pour toi seul' },
  duo:  { name: 'Duo',   who: 'Pour toi et ton binôme' },
}

const formulasEn: Record<KitFormula, { name: string; who: string }> = {
  solo: { name: 'Solo',  who: 'Just for you' },
  duo:  { name: 'Duo',   who: 'For you and your partner' },
}

/* ── Avancement, tel que le CLIENT le lit ─────────────────────────────────── */

/**
 * Indexé par `kit_orders.status` — les 8 valeurs du CHECK.
 *
 * Formulé à la deuxième personne et tourné vers LA SUITE, pas vers l'étape
 * franchie : ce que le client veut savoir, c'est ce qui l'attend, pas comment on
 * a nommé sa ligne en base.
 *
 * `annule` reste neutre à dessein : un dossier peut être annulé pour un
 * désistement comme pour un remboursement, et l'écran n'a pas à trancher.
 */
const progressFr: Record<KitStatus, string> = {
  demande:          'Ta demande est enregistrée. On revient vers toi pour caler l\'appel de découverte.',
  acompte_paye:     'Acompte reçu, merci. Prochaine étape : l\'appel de découverte.',
  decouverte_faite: 'On a fait le point ensemble. On construit ton kit — ça prend quelques jours.',
  kit_trouve:       'Ton kit est prêt. Il reste le solde à régler, puis on cale la session.',
  solde_paye:       'Solde reçu. On planifie la session d\'explication et les games de test.',
  session_faite:    'Session faite. On finalise, tu recevras tout par écrit.',
  termine:          'Ton kit est livré. Bon grind — et reviens nous dire où tu en es.',
  annule:           'Ce dossier est clos.',
}

const progressEn: Record<KitStatus, string> = {
  demande:          'Your request is in. We\'ll get back to you to schedule the discovery call.',
  acompte_paye:     'Deposit received, thanks. Next up: the discovery call.',
  decouverte_faite: 'We\'ve talked it through. We\'re building your kit — it takes a few days.',
  kit_trouve:       'Your kit is ready. The balance is left to pay, then we book the session.',
  solde_paye:       'Balance received. We\'re scheduling the walkthrough and the test games.',
  session_faite:    'Session done. We\'re wrapping up — you\'ll get everything in writing.',
  termine:          'Your kit is delivered. Enjoy the climb — and tell us how it goes.',
  annule:           'This order is closed.',
}

/* ── Erreurs des RPC clientes ─────────────────────────────────────────────── */

/**
 * Codes levés par `kit_request_order` (migration 20260909000001), remontés par
 * PostgREST dans `error.message`. Même traitement que `admin.kits.errors` :
 * une table d'affichage, cherchée PAR INCLUSION, avec repli sur le message brut.
 *
 * ⚠️ `kit_service_disabled` ne devrait jamais s'afficher : l'onglet est masqué
 * quand le flag est coupé. S'il apparaît, c'est que le flag est tombé PENDANT
 * que le formulaire était ouvert — d'où un texte qui décrit la situation plutôt
 * qu'une erreur technique.
 */
const errorsFr = {
  not_authenticated:        'Ta session a expiré — reconnecte-toi et recommence.',
  kit_service_disabled:     'Le service n\'est pas ouvert pour le moment. Réessaie plus tard.',
  invalid_snapshot:         'Le formulaire n\'a pas pu être envoyé. Recharge la page et réessaie.',
  snapshot_too_large:       'Tes réponses sont trop longues — raccourcis-les un peu.',
  kit_order_already_active: 'Tu as déjà une demande en cours. On revient vers toi.',
}

export type KitRpcErrorKey = keyof typeof errorsFr

const errorsEn: Record<KitRpcErrorKey, string> = {
  not_authenticated:        'Your session expired — sign in again and retry.',
  kit_service_disabled:     'The service isn\'t open right now. Please try again later.',
  invalid_snapshot:         'The form could not be sent. Reload the page and retry.',
  snapshot_too_large:       'Your answers are a bit too long — please shorten them.',
  kit_order_already_active: 'You already have a request in progress. We\'ll get back to you.',
}

/* ── Dictionnaire ─────────────────────────────────────────────────────────── */

export const kitFr = {
  /* Écran « bientôt » — deep-link `?tab=kit` alors que le flag est fermé.
     L'entrée de sidebar, elle, a déjà disparu (convention `off_behavior='hidden'`).
     Clés dédiées plutôt que réutilisation de `pitch` : ici on ne vend rien, on
     dit seulement que ce n'est pas encore ouvert. */
  soonTitle: 'Kit sur mesure',
  soonText:  'Ce service ouvre bientôt. Reviens d\'ici peu.',

  /* Présentation du service. */
  pitch: {
    eyebrow:  'Accompagnement',
    title:    'Un kit taillé pour toi',
    subtitle: 'On regarde ton jeu, on construit un plan, on te l\'explique en direct.',
    /* Les étapes annoncées au client. Volontairement 4 et non 8 : la machine
       d'états interne en compte 8 parce qu'elle sépare les encaissements, ce qui
       ne concerne pas la promesse commerciale. */
    steps: [
      'Un appel de découverte pour comprendre où tu bloques.',
      'On construit ton kit à deux, hors ligne, en prenant le temps.',
      'Une session d\'explication, puis on teste ensemble en jeu.',
      'Tu repars avec le plan écrit, à toi de jouer.',
    ],
    /* ⚠️ Mention OBLIGATOIRE tant que le lot 4 n'est pas livré : rien n'est
       payable en ligne, et laisser croire le contraire serait trompeur. */
    noPayment: 'Aucun paiement en ligne pour l\'instant : on cale tout de vive voix.',
  },

  /* Grille tarifaire. `{price}` est déjà formaté en devise par l'appelant. */
  formulas: formulasFr,
  price:    '{price}',
  pick:     'Choisir',
  picked:   'Choisi',

  /* Prise de rendez-vous. */
  booking: {
    title:    'Prendre rendez-vous',
    hint:     'Choisis un créneau, on t\'appelle sur Discord.',
    action:   'Voir les créneaux',
    /* Repli quand aucune URL de réservation n'est configurée. */
    fallback: 'Écris-nous et on cale un créneau ensemble.',
  },

  /* Formulaire de capture. */
  form: {
    title: 'Parle-nous de toi',
    hint:  'Ces réponses sont figées au moment de l\'envoi — elles servent de point de départ pour mesurer tes progrès.',

    rank:               'Ton rang actuel',
    rankPlaceholder:    'Choisis ton rang…',
    role:               'Ton rôle principal',
    rolePlaceholder:    'Choisis ton rôle…',
    goals:              'Tes objectifs',
    goalsPlaceholder:   'Ex. : monter en Platine avant la fin de saison, arrêter de perdre mes early…',
    availability:       'Tes disponibilités',
    availabilityPlaceholder: 'Ex. : soirs de semaine après 20h, week-end variable',
    liked:              'Les champions que tu aimes',
    likedPlaceholder:   'Ex. : Lee Sin, Vi, Hecarim',
    disliked:           'Ceux que tu ne veux pas jouer',
    dislikedPlaceholder:'Ex. : Evelynn',
    playstyle:          'Ton style de jeu',
    playstylePlaceholder: 'Ex. : agressif early, je force les ganks bot',

    /* Bloc binôme, visible en formule duo uniquement. */
    partnerTitle:    'Ton binôme',
    partnerGamename: 'Son pseudo Riot',
    partnerTagline:  'Son tag',
    partnerRole:     'Son rôle',
    /* `#` est le séparateur d'un Riot ID — pas traduit, c'est de la syntaxe. */
    partnerHint:     'On le contactera avec toi au moment de l\'appel.',

    /* Compteur de caractères. `{n}` restants, `{max}` au total. */
    counter: '{n}/{max}',

    /* Messages d'erreur, indexés par la clé que renvoie `validateKitForm`. */
    errors: {
      required: 'À remplir.',
      tooLong:  'Un peu trop long.',
    },
    sizeError: 'L\'ensemble de tes réponses est trop long — raccourcis-en une ou deux.',

    submit:     'Envoyer ma demande',
    submitting: 'Envoi…',
    /* `{message}` = libellé résolu depuis `errors`, ou le message brut. */
    errorPrefix: 'Erreur : {message}',
  },

  /* Écran affiché quand un dossier existe déjà. */
  existing: {
    title:  'Ta demande',
    /* Indexé par `kit_orders.status`. */
    progress: progressFr,
    /* `{date}` est formaté par l'appelant. */
    since:  'Déposée le {date}',
    /* Ce qu'on montre de ce que le client a rempli — relu depuis le SNAPSHOT
       figé, jamais depuis le profil courant. */
    snapshotTitle: 'Ce que tu nous as dit',
    snapshotHint:  'Figé au moment de ta demande — ton profil a pu changer depuis.',
    reopen: 'Une question ? Écris-nous.',
  },

  /* Codes d'erreur des RPC. */
  errors: errorsFr,
}

export type KitDict = typeof kitFr

export const kitEn: KitDict = {
  soonTitle: 'Custom kit',
  soonText:  'This service opens soon. Check back shortly.',

  pitch: {
    eyebrow:  'Coaching',
    title:    'A kit built for you',
    subtitle: 'We study your games, build a plan, and walk you through it live.',
    steps: [
      'A discovery call to understand where you get stuck.',
      'We build your kit together, offline, taking our time.',
      'A walkthrough session, then we test it in game together.',
      'You leave with the written plan — the rest is on you.',
    ],
    noPayment: 'No online payment for now: we sort everything out on the call.',
  },

  formulas: formulasEn,
  price:    '{price}',
  pick:     'Choose',
  picked:   'Chosen',

  booking: {
    title:    'Book a call',
    hint:     'Pick a slot, we\'ll call you on Discord.',
    action:   'See available slots',
    fallback: 'Drop us a line and we\'ll find a slot together.',
  },

  form: {
    title: 'Tell us about yourself',
    hint:  'These answers are frozen when you submit — they are the baseline we measure your progress against.',

    rank:               'Your current rank',
    rankPlaceholder:    'Pick your rank…',
    role:               'Your main role',
    rolePlaceholder:    'Pick your role…',
    goals:              'Your goals',
    goalsPlaceholder:   'e.g. reach Platinum before the season ends, stop losing my early game…',
    availability:       'Your availability',
    availabilityPlaceholder: 'e.g. weekday evenings after 8pm, weekends vary',
    liked:              'Champions you enjoy',
    likedPlaceholder:   'e.g. Lee Sin, Vi, Hecarim',
    disliked:           'Ones you would rather not play',
    dislikedPlaceholder:'e.g. Evelynn',
    playstyle:          'Your playstyle',
    playstylePlaceholder: 'e.g. aggressive early, I force bot ganks',

    partnerTitle:    'Your partner',
    partnerGamename: 'Their Riot name',
    partnerTagline:  'Their tag',
    partnerRole:     'Their role',
    partnerHint:     'We\'ll reach out to them alongside you when we call.',

    counter: '{n}/{max}',

    errors: {
      required: 'Required.',
      tooLong:  'A bit too long.',
    },
    sizeError: 'Your answers are too long overall — trim one or two.',

    submit:     'Send my request',
    submitting: 'Sending…',
    errorPrefix: 'Error: {message}',
  },

  existing: {
    title:  'Your request',
    progress: progressEn,
    since:  'Submitted on {date}',
    snapshotTitle: 'What you told us',
    snapshotHint:  'Frozen when you submitted — your profile may have changed since.',
    reopen: 'Any question? Drop us a line.',
  },

  errors: errorsEn,
}

/* ── Résolveurs ───────────────────────────────────────────────────────────── */

/**
 * Message d'avancement destiné au CLIENT, indexé par `kit_orders.status`.
 *
 * Repli sur `demande` — le DEFAULT de la colonne — si la base porte un statut
 * que ce dico ne connaît pas encore. Un client ne doit jamais voir un écran vide
 * ni une valeur technique comme `session_faite`.
 */
export function kitProgressMessage(dict: KitDict, status?: string | null): string {
  return dict.existing.progress[(status ?? '') as KitStatus] ?? dict.existing.progress.demande
}

/**
 * Message lisible pour une erreur remontée par `kit_request_order`.
 *
 * Cherché PAR INCLUSION : une exception plpgsql n'arrive jamais nue, elle est
 * enveloppée par PostgREST. Même mécanique que `kitErrorLabel` côté admin, et
 * même repli — un message inconnu est rendu TEL QUEL plutôt que masqué, pour
 * rester diagnosticable.
 */
export function kitRpcError(dict: KitDict, message?: string | null): string {
  if (!message) return dict.errors.invalid_snapshot
  for (const code of Object.keys(dict.errors) as KitRpcErrorKey[]) {
    if (message.includes(code)) return dict.errors[code]
  }
  return message
}

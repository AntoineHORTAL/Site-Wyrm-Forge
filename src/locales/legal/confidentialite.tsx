'use client'

import { List } from '@/components/legal/LegalBlocks'
import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

/**
 * Politique de confidentialité — texte FR et EN.
 *
 * Conventions de traduction : voir l'en-tête de `./mentions`.
 *
 * ⚠️ Les NOMS TECHNIQUES ne se traduisent pas : clés de stockage local
 * (`wf-lang`, `wf.matchups.v2`…), nom du cookie de session Supabase, noms de
 * tables. Ce sont des identifiants que le lecteur doit pouvoir retrouver tels
 * quels dans son navigateur.
 *
 * ⚠️ Cette page ne rend AUCUN `<Todo>` : les trous du dossier légal vivent tous
 * dans /mentions-legales. Ne pas en ajouter ici sans l'ajouter aux DEUX langues.
 */

export const confidentialiteFr = {
  title: 'Politique de',
  accent: 'confidentialité',
  /** ISO — formatée dans la langue lue par `LegalPage`. */
  updated: '2026-10-14',
  intro: (
    <>
      Wyrm Forge est un assistant de jeu pour League of Legends. Pour fonctionner, il traite
      un petit nombre de données personnelles : celles de ton compte, celles de ton compte Riot
      si tu choisis de le lier, et les données de jeu que l&apos;API de Riot Games nous renvoie.
      Cette page décrit précisément lesquelles, pourquoi, et ce que tu peux exiger à leur sujet.
    </>
  ),
  sections: {
    controller: {
      title: '1. Responsable du traitement',
      body: (
        <>
          <p>
            Le responsable du traitement est la société <strong>Wyrm Forge</strong>, société par
            actions simplifiée unipersonnelle au capital de 500 €, dont le siège social est situé
            5 Rue du 23 Janvier, 21000 Dijon, France. Ses mentions d&apos;immatriculation complètes
            figurent dans nos mentions légales.
          </p>

          <p style={{ marginTop: 10 }}>
            Pour toute question relative à tes données personnelles :{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>. Aucun délégué à la protection des données (DPO) n&apos;est désigné à ce stade,
            la désignation n&apos;étant pas obligatoire au regard de la nature et du volume des
            traitements réalisés.
          </p>
        </>
      ),
    },
    collected: {
      title: '2. Données que nous collectons',
      body: (
        <>
          <p><strong>Données de compte</strong> — indispensables pour te connecter :</p>
          <List>
            <li>adresse e-mail et nom d&apos;utilisateur ;</li>
            <li>mot de passe, stocké uniquement sous forme chiffrée par Supabase Auth
              (nous n&apos;y avons jamais accès en clair) ;</li>
            <li>date de création du compte, formule d&apos;abonnement et date d&apos;expiration
              éventuelle, statut de certification.</li>
          </List>

          <p style={{ marginTop: 16 }}>
            <strong>Compte Riot — uniquement si tu le lies volontairement</strong> :
          </p>
          <List>
            <li>ton Riot ID (nom de jeu et tag) et ta plateforme de jeu (par exemple <code>euw1</code>) ;</li>
            <li>ton PUUID, l&apos;identifiant stable attribué par Riot Games ;</li>
            <li>le rang que tu déclares toi-même sur ton profil.</li>
          </List>
          <p style={{ marginTop: 8 }}>
            La liaison passe par un défi d&apos;icône de profil : tu prouves que le compte est le tien
            en changeant temporairement ton icône dans le jeu. Tu peux délier ton compte Riot à tout
            moment depuis ta page profil, sans supprimer ton compte Wyrm Forge.
          </p>

          <p style={{ marginTop: 16 }}><strong>Données de jeu</strong> :</p>
          <List>
            <li>historique de parties, statistiques et compositions récupérés à la demande auprès de
              l&apos;API Riot Games, et conservés en cache pour une durée limitée (voir § 6) ;</li>
            <li>parties dont tu as consulté le détail, afin de valider les quêtes correspondantes.</li>
          </List>

          {/* Chantier confidentialité (2026-10-14) : `riot_cache` (détail des matchs, 30 j),
              `rank_stat_samples` (1 an), `searched_summoners` (6 mois), purgés par
              `privacy_purge()` (20261014000001) ; opposition : `riot_privacy_exclusions`
              (20261014000003). Toute promesse ci-dessous doit rester vraie dans le code. */}
          <p style={{ marginTop: 16 }}><strong>Joueurs consultés — avec ou sans compte Wyrm
            Forge</strong> — quand quelqu&apos;un consulte un joueur sur le site ou dans
            l&apos;application, l&apos;API officielle de Riot Games nous transmet les données de ce
            joueur et celles des autres participants de ses parties. Ces personnes n&apos;ont pas
            forcément de compte chez nous et ne nous ont pas fourni ces données elles-mêmes :
            elles proviennent de Riot Games, qui les rend accessibles pour tout compte League of
            Legends. Il s&apos;agit :</p>
          <List>
            <li>du Riot ID (nom de jeu et tag), du PUUID (identifiant stable attribué par Riot
              Games), de la région et du rang ;</li>
            <li>des statistiques de chaque partie : champion, rôle, éliminations, morts et
              assistances, sbires, score de vision, dégâts, or, objets, runes, déroulé de la
              partie.</li>
          </List>
          <p style={{ marginTop: 8 }}>Nous en conservons trois choses :</p>
          <List>
            <li>le détail des parties consultées, en cache, pour ne pas interroger Riot Games à
              chaque affichage ;</li>
            <li>pour les joueurs recherchés par leur Riot ID sur la page joueur, un échantillon par
              partie (PUUID, rang, rôle et statistiques de la partie). Ces échantillons sont
              stockés un par un et ne sont additionnés qu&apos;au moment de calculer une moyenne
              par rang, affichée seulement à partir de 50 parties pour un même rang, rôle et file.
              Ils ne sont jamais affichés individuellement ;</li>
            <li>les Riot ID réellement recherchés, pour l&apos;autocomplétion de la barre de
              recherche.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Contenus que tu crées</strong> :</p>
          <List>
            <li>builds d&apos;items, jungle paths, to-do lists, scénarios de macro, analyses de match up ;</li>
            <li>contributions publiées sur le Workshop, visibles par les autres utilisateurs.</li>
          </List>

          {/* `stripe_subscriptions` (20260909000003) et `checkout_consent_log`
              (20260911000003). Aucune donnée de carte : elle reste chez Stripe. */}
          <p style={{ marginTop: 16 }}><strong>Abonnement payant — uniquement si tu souscris</strong> :</p>
          <List>
            <li>tes identifiants de client et d&apos;abonnement chez Stripe, le palier souscrit, le
              statut de l&apos;abonnement et ses dates d&apos;échéance ;</li>
            <li>la preuve de ta demande d&apos;accès immédiat au service, recueillie avant le
              paiement : date et heure, texte exact de la case cochée et sa version, langue
              d&apos;affichage, palier et périodicité choisis, version des conditions générales de
              vente ;</li>
            {/* `subscription_emails` (20260911000004). */}
            <li>l&apos;historique des e-mails de service liés à ton abonnement (confirmation de
              commande, confirmation de résiliation, rappel avant reconduction) : type d&apos;e-mail,
              date d&apos;envoi, adresse de destination et identifiant d&apos;envoi.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Écailles (monnaie virtuelle interne)</strong> :</p>
          <List>
            <li>journal des mouvements (gains de quêtes, achats en boutique) ;</li>
            <li>quêtes complétées par jour, série de jours consécutifs, cosmétiques possédés et équipés.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Recherches publiques</strong> — les Riot ID recherchés
            sur le site (région, nom, tag) sont mémorisés pour alimenter l&apos;autocomplétion de la
            barre de recherche. Ces entrées ne sont associées à aucun compte : il est impossible de
            savoir qui a recherché quoi. Seuls les Riot ID effectivement recherchés y figurent, pas
            les autres joueurs des parties affichées.</p>

          <p style={{ marginTop: 16 }}><strong>Données techniques</strong> — ton adresse IP sert à
            limiter le nombre de requêtes par visiteur (protection anti-abus et respect des quotas
            Riot). Elle n&apos;est jamais enregistrée en clair : pour compter tes requêtes, nous
            n&apos;en gardons qu&apos;une empreinte calculée avec une clé secrète, supprimée au plus
            tard deux heures après ta dernière requête. Elle ne sert à aucun profilage.</p>
        </>
      ),
    },
    cookies: {
      title: '3. Cookies et stockage local',
      body: (
        <>
          <p>
            Quatre choses seulement peuvent être déposées ou lues sur ton appareil : un cookie
            de session et un cookie de protection contre les robots, tous deux
            <strong> strictement nécessaires</strong> au fonctionnement du service, la
            <strong> bannière de consentement</strong>, qui mémorise ta réponse pour ne pas te la
            redemander à chaque visite, et le script publicitaire de Google, qui n&apos;est chargé
            <strong> qu&apos;avec ton consentement</strong>. Nous n&apos;utilisons aucun outil de
            mesure d&apos;audience.
          </p>

          <p style={{ marginTop: 16 }}><strong>Cookies strictement nécessaires</strong> —
            déposés sans consentement, parce que le service ne peut pas fonctionner sans eux.
            Aucun des deux ne sert à la publicité ni à te suivre d&apos;un site à l&apos;autre :</p>
          <List>
            <li><code>sb-…-auth-token</code> — cookie de session émis par Supabase Auth. Il te
              maintient connecté d&apos;une page à l&apos;autre. Attributs <code>SameSite=Lax</code>
              et <code>Secure</code> en production. Sans lui, la connexion est impossible.</li>
            {/* Qualification « strictement nécessaire » reprise de la documentation de
                Cloudflare elle-même, qui classe __cf_bm parmi ses cookies strictement
                nécessaires et précise qu'il n'est posé que sur les sites protégés par Bot
                Management ou Bot Fight Mode.
                ⚠️ MESURÉ le 2026-09-12 : aucun cookie Cloudflare n'est posé sur wyrm-forge.com
                en l'état (3 chemins testés avec des en-têtes de navigateur). D'où « lorsque
                cette protection est active » — la phrase reste vraie aujourd'hui ET le jour où
                HORTAL activera la protection anti-robots. Ne pas la transformer en affirmation
                sans avoir re-mesuré. */}
            <li><code>__cf_bm</code> — cookie de Cloudflare, qui filtre le trafic automatisé
              (robots, attaques par déni de service) avant qu&apos;il n&apos;atteigne le site. Il
              porte un score de détection de robot et expire après 30 minutes d&apos;inactivité.
              Il ne contient aucun identifiant publicitaire et n&apos;est jamais utilisé pour du
              ciblage. Il n&apos;est déposé que lorsque cette protection est active sur le
              domaine.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Bannière de consentement</strong> — déposée dans
            tous les cas, aucun consentement requis :</p>
          <p>
            À ta première visite, une bannière te demande si tu acceptes les cookies
            publicitaires. Elle est fournie par la plateforme de gestion du consentement de
            Google (« CMP », conforme au cadre TCF de l&apos;IAB Europe) et enregistre ta réponse
            sur ton appareil, afin de ne pas te reposer la question à chaque page.
          </p>
          <p style={{ marginTop: 12 }}>
            Ce dépôt-là n&apos;est pas soumis à ton consentement, pour une raison simple : c&apos;est
            lui qui le recueille, et c&apos;est lui qui garde la trace de ton refus. Sans lui, la
            question te serait reposée indéfiniment.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Refuser est aussi simple qu&apos;accepter</strong> : les deux choix sont
            proposés au même endroit, dès la bannière, sans sous-menu à parcourir. Tu peux{' '}
            <strong>changer d&apos;avis à tout moment</strong> en cliquant sur « Gérer les
            cookies », en bas de n&apos;importe quelle page du site.
          </p>

          <p style={{ marginTop: 16 }}><strong>Script publicitaire</strong> — soumis à ton
            consentement préalable :</p>
          <p>
            Wyrm Forge est inscrit au programme publicitaire <strong>Google AdSense</strong>. Le
            script fourni par Google est susceptible de déposer des cookies et de lire des
            identifiants sur ton appareil. Il n&apos;est chargé <strong>que si tu y as
            consenti</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            Tant que tu n&apos;as pas répondu, et si tu refuses : <strong>le script de Google
            n&apos;est pas chargé, aucune requête publicitaire n&apos;est envoyée à Google depuis
            ton navigateur et aucun cookie publicitaire n&apos;est déposé.</strong> Le verrou est
            fermé par défaut — ton silence vaut refus, jamais acceptation. Les emplacements
            réservés dans la page restent alors vides.
          </p>
          <p style={{ marginTop: 16 }}><strong>Stockage local</strong> — ces données restent
            <strong> uniquement sur ton appareil</strong> et ne nous sont jamais transmises :</p>
          <List>
            <li><code>wf.matchups.v2</code> et <code>wf.matchups.v1</code> — tes scénarios de
              Match Up ;</li>
            <li><code>wf-lang</code> et <code>wf-landing-lang</code> — ta langue d&apos;affichage ;</li>
            <li><code>wf.stripe.checkout-intent</code> — le palier que tu venais de choisir, gardé
              le temps de te connecter pour reprendre le paiement là où tu l&apos;avais laissé ;</li>
            <li>ta préférence de thème.</li>
          </List>
          <p style={{ marginTop: 12 }}>
            Vider les données de ton navigateur les efface définitivement.
          </p>
        </>
      ),
    },
    purposes: {
      title: '4. Pourquoi nous traitons ces données',
      body: (
        <List>
          <li><strong>Exécution du contrat</strong> — créer et gérer ton compte, fournir les outils
            du service, gérer un éventuel abonnement, et t&apos;envoyer par e-mail la confirmation
            de ta commande et, le cas échéant, de ta résiliation.</li>
          <li><strong>Consentement</strong> — liaison de ton compte Riot. Retirable à tout
            moment, sans justification.</li>
          <li><strong>Intérêt légitime</strong> — sécurité du service, prévention des abus,
            respect des quotas imposés par Riot Games, amélioration des fonctionnalités.</li>
          <li><strong>Intérêt légitime — joueurs consultés</strong> — afficher les statistiques de
            jeu d&apos;un joueur à la personne qui le consulte, et calculer des moyennes par rang.
            Nous estimons que cet intérêt ne porte pas une atteinte excessive aux droits des
            joueurs concernés, car les données sont publiées par Riot Games pour tout compte, nous
            ne les rattachons à aucune identité civile, elles ne servent à aucun profilage ni à
            aucune publicité, et leur durée de conservation est courte (§ 6). Chaque joueur peut
            s&apos;y opposer (§ 7).</li>
          <li><strong>Obligation légale</strong> — conservation des pièces comptables des
            abonnements payants, et de la preuve de ta demande d&apos;accès immédiat au service
            (article L221-25 du Code de la consommation), que nous devons pouvoir produire en
            cas de rétractation ou de litige ; et l&apos;e-mail de rappel envoyé avant la
            reconduction d&apos;un abonnement annuel (article L215-1 du Code de la consommation).</li>
        </List>
      ),
    },
    sharing: {
      title: '5. Avec qui ces données sont partagées',
      body: (
        <>
          <p>
            Nous ne vendons ni ne louons aucune donnée, et n&apos;en transmettons aucune à des fins
            publicitaires. Nous faisons appel aux prestataires techniques suivants, chacun
            strictement pour la finalité indiquée :
          </p>
          <List>
            <li><strong>Supabase</strong> — hébergement de la base de données, de
              l&apos;authentification et des fichiers, et envoi des e-mails liés à ton compte
              (confirmation d&apos;inscription, réinitialisation de mot de passe). C&apos;est là
              que résident ton compte et tes contenus. <strong>Le projet est hébergé en Irlande,
              dans l&apos;Union européenne</strong> : tes données y sont stockées et traitées.</li>
            <li><strong>Vercel</strong> — hébergement et diffusion du site web.</li>
            <li><strong>Cloudflare</strong> — diffusion du site et protection contre les attaques
              par déni de service et le trafic automatisé. L&apos;ensemble des requêtes vers
              wyrm-forge.com transite par son réseau avant d&apos;atteindre l&apos;hébergement : il
              voit donc ton adresse IP et les en-têtes techniques de ta requête. Il ne reçoit
              aucune donnée de ton compte ni aucun contenu que tu as créé.</li>
            <li><strong>Riot Games</strong> — l&apos;API officielle de League of Legends. Nos serveurs
              lui transmettent ton Riot ID ou ton PUUID pour récupérer tes données de jeu.
              Ces échanges sont régis par la politique de confidentialité de Riot Games.</li>
            <li><strong>Anthropic</strong> — génération des analyses IA (Match Up, bilan
              d&apos;après-partie, résumés de patch notes). Seul le contexte nécessaire est envoyé :
              pour un Match Up, les champions, niveaux et objets de la simulation ; pour un bilan
              d&apos;après-partie, les faits de la partie analysée (champion, rôle, statistiques,
              objets, runes, morts, objectifs et, selon l&apos;option choisie, ceux de
              l&apos;adversaire de voie). Aucun Riot ID, aucun PUUID, aucune adresse e-mail.</li>
            <li><strong>Stripe</strong> — traitement des paiements des abonnements, facturation et
              portail de gestion de l&apos;abonnement. Nous ne stockons aucune donnée de carte
              bancaire : elles sont saisies directement chez Stripe.</li>
            {/* Réintégré le 2026-09-11 (e-mails d'abonnement, EF `subscription-emails`).
                Il avait été retiré avec le module PRAC, son seul usage d'alors. */}
            <li><strong>Resend</strong> — envoi des e-mails transactionnels liés à ton abonnement
              (confirmation de commande, confirmation de résiliation, rappel avant reconduction).
              Il reçoit ton adresse e-mail et le contenu du message, rien d&apos;autre.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Où sont tes données, et ce qui sort de l&apos;UE</strong></p>
          <p>
            Le lieu de stockage et la nationalité du prestataire sont deux questions distinctes, et
            elles n&apos;ont pas la même réponse :
          </p>
          <List>
            <li><strong>Supabase</strong> — tes données sont stockées <strong>en Irlande, dans
              l&apos;UE</strong>. Mais la société qui exploite le service, Supabase, Inc., est
              établie à Singapour, pays qui ne bénéficie pas d&apos;une décision d&apos;adéquation
              de la Commission européenne. Un accès depuis l&apos;extérieur de l&apos;UE reste donc
              possible, notamment pour l&apos;administration technique et le support. Cet accès est
              encadré par les clauses contractuelles types de la Commission européenne, intégrées à
              l&apos;accord de traitement des données (DPA) de Supabase.</li>
            <li><strong>Cloudflare</strong> — même distinction que pour Supabase, dans
              l&apos;autre sens : la société est établie <strong>aux États-Unis</strong>, mais le
              trafic européen est traité par ses <strong>serveurs périphériques situés dans
              l&apos;UE</strong>, au plus près du visiteur. Les transferts qui en sortent
              s&apos;appuient sur les mêmes garanties que ci-dessous.</li>
            <li><strong>Les autres prestataires</strong> — Vercel, Stripe, Anthropic et Resend sont
              établis aux États-Unis. Les transferts correspondants s&apos;appuient sur les clauses
              contractuelles types de la Commission européenne et, pour ceux qui y sont certifiés,
              sur le cadre de protection des données UE–États-Unis (Data Privacy Framework).</li>
          </List>
          {/* À COMPLÉTER PAR HORTAL — vérifier et consigner, prestataire par prestataire :
              (1) que le DPA de Supabase est bien signé et quelle version des CCT il intègre ;
              (2) lesquels de Vercel / Stripe / Anthropic / Resend / Cloudflare sont effectivement certifiés
              au Data Privacy Framework (la liste officielle est publique et évolue) — et, pour
              Resend, la région d'envoi du domaine (le MX de send.wyrm-forge.com pointe
              eu-west-1, ce qui ne dit rien du lieu de stockage des journaux Resend) ;
              (3) l'existence d'une analyse de transfert pour Singapour, qui n'est couvert par
              AUCUNE décision d'adéquation. Tant que ce n'est pas fait, le paragraphe ci-dessus
              décrit l'intention, pas une conformité vérifiée. */}
          <p style={{ marginTop: 12 }}>
            Tu peux nous demander une copie des garanties encadrant ces transferts en écrivant à{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>.
          </p>
        </>
      ),
    },
    retention: {
      title: '6. Combien de temps nous les conservons',
      body: (
        <List>
          <li><strong>Compte et contenus</strong> — tant que ton compte existe. Après une demande de
            suppression, effacement définitif sous 30 jours maximum.</li>
          <li><strong>Cache des données Riot</strong> — de quelques minutes à 30 jours selon le type
            de donnée (30 jours pour le détail d&apos;une partie), puis suppression dans les 48 heures
            qui suivent. Ce délai permet de continuer à afficher les données si le quota d&apos;appels
            Riot du jour est épuisé. Il s&apos;agit d&apos;un cache technique, pas d&apos;un
            archivage.</li>
          <li><strong>Échantillons de performance par rang</strong> — un an au maximum, puis
            suppression automatique.</li>
          <li><strong>Parties dont tu as consulté le détail</strong> — 30 jours.</li>
          <li><strong>Empreintes d&apos;adresse IP</strong> — deux heures au plus.</li>
          <li><strong>Journal des Écailles</strong> — conservé tant que le compte existe, pour
            garantir l&apos;intégrité du solde ; supprimé avec le compte.</li>
          <li><strong>Données d&apos;abonnement</strong> — tant que le compte existe ; supprimées
            avec le compte. Les factures sont conservées par Stripe pendant la durée imposée par
            les obligations comptables (10 ans).</li>
          {/* ⚠️ Aucune purge automatique n'existe : la première échéance tombe en
              2031. À planifier avant cette date (AGENTS.md § CGV). Le détachement
              du compte est, lui, automatique : FK `ON DELETE SET NULL`. */}
          <li><strong>Preuve de ta demande d&apos;accès immédiat</strong> — 5 ans à compter de ta
            souscription (délai de prescription des actions civiles), pour pouvoir la produire en
            cas de litige. Si ton compte est supprimé avant, la preuve est conservée pour la même
            durée, mais détachée de ton compte.</li>
          {/* ⚠️ Même dette que la preuve de consentement : aucune purge automatique,
              première échéance en 2031. */}
          <li><strong>Historique des e-mails d&apos;abonnement</strong> — 5 ans à compter de
            l&apos;envoi, pour pouvoir prouver que les informations légales t&apos;ont bien été
            adressées. Si ton compte est supprimé avant, l&apos;historique est conservé pour la
            même durée, détaché de ton compte ; un e-mail qui n&apos;était pas encore parti
            n&apos;est jamais envoyé.</li>
          <li><strong>Riot ID recherchés (autocomplétion)</strong> — 6 mois après la dernière
            recherche. Il s&apos;agit d&apos;identifiants de jeu, non rattachés à un compte Wyrm
            Forge.</li>
        </List>
      ),
    },
    rights: {
      title: '7. Tes droits',
      body: (
        <>
          <p>
            Conformément au RGPD, tu disposes des droits d&apos;accès, de rectification,
            d&apos;effacement, de limitation, d&apos;opposition et de portabilité, ainsi que du droit
            de retirer ton consentement à tout moment.
          </p>
          <List>
            <li><strong>Accès et rectification</strong> — la majorité de tes données sont consultables
              et modifiables depuis ta page profil (nom d&apos;utilisateur, rang déclaré, liaison Riot).</li>
            <li><strong>Effacement</strong> — un bouton dédié sur ta page profil ouvre une demande de
              suppression de compte, traitée sous 30 jours (article 17 du RGPD). Elle entraîne la
              suppression de ton profil, de tes contenus, de tes contributions publiques et du lien
              vers ton compte Riot. Tu peux annuler ta demande tant qu&apos;elle n&apos;a pas été traitée.</li>
            <li><strong>Portabilité</strong> — écris-nous à contact@wyrm-forge.com pour recevoir une
              copie de tes données dans un format structuré et lisible par machine.</li>
            <li><strong>Retrait du consentement</strong> — délier ton compte Riot depuis ton
              profil, à tout moment et sans justification.</li>
            {/* Procédure : `privacy_forget_player()` (20261014000003). */}
            <li><strong>Tu n&apos;as pas de compte Wyrm Forge ?</strong> — tes droits d&apos;accès,
              d&apos;effacement et d&apos;opposition s&apos;appliquent aussi aux données décrites au
              § 2 « Joueurs consultés ». Écris-nous à contact@wyrm-forge.com en indiquant ton Riot
              ID et ta région. Nous pouvons te demander de prouver que ce compte Riot est le tien.
              Nous supprimons alors, dans un délai d&apos;un mois, les échantillons liés à ton
              PUUID, les parties en cache qui te concernent et ton Riot ID de
              l&apos;autocomplétion. Pour que ton opposition tienne dans le temps, nous gardons ton
              seul PUUID dans une liste d&apos;exclusion, et plus aucun échantillon ni entrée
              d&apos;autocomplétion n&apos;est créé à ton nom.</li>
          </List>
          <p style={{ marginTop: 12 }}>
            Nous répondons à toute demande dans un délai d&apos;un mois. Si tu estimes que tes droits
            ne sont pas respectés, tu peux introduire une réclamation auprès de la CNIL
            (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>www.cnil.fr</a>).
          </p>
        </>
      ),
    },
    security: {
      title: '8. Sécurité',
      body: (
        <>
          <p>
            Les échanges avec le site sont chiffrés en HTTPS. L&apos;accès aux données en base est
            restreint ligne par ligne : par construction, un utilisateur ne peut lire que ses propres
            données. Les clés d&apos;API sensibles (Riot Games, Anthropic, Stripe) restent
            exclusivement côté serveur et ne sont jamais exposées au navigateur.
          </p>
          <p style={{ marginTop: 10 }}>
            Aucun système n&apos;est infaillible. En cas de violation de données susceptible
            d&apos;engendrer un risque pour tes droits, nous en informerons la CNIL et, le cas échéant,
            les personnes concernées, dans les délais prévus par le RGPD.
          </p>
        </>
      ),
    },
    minors: {
      title: '9. Mineurs',
      body: (
        <p>
          Le service n&apos;est pas destiné aux enfants de moins de 15 ans. Si tu as entre 15 et
          18 ans, nous te recommandons d&apos;utiliser Wyrm Forge avec l&apos;accord de tes parents
          ou de ton représentant légal. Si nous apprenons qu&apos;un compte a été créé par un enfant
          de moins de 15 ans sans autorisation parentale, nous le supprimerons.
        </p>
      ),
    },
    changes: {
      title: '10. Modifications',
      body: (
        <p>
          Cette politique peut évoluer, notamment à mesure que le service sort de sa phase de bêta
          et que de nouvelles fonctionnalités apparaissent. La date de dernière mise à jour figure
          en haut de cette page. En cas de modification substantielle, les utilisateurs disposant
          d&apos;un compte en seront informés par e-mail.
        </p>
      ),
    },
  },
}

export type ConfidentialiteDict = typeof confidentialiteFr

export const confidentialiteEn: ConfidentialiteDict = {
  title: 'Privacy',
  accent: 'policy',
  updated: '2026-10-14',
  intro: (
    <>
      Wyrm Forge is a companion tool for League of Legends. To work, it processes a small amount of
      personal data: that of your account, that of your Riot account if you choose to link it, and
      the game data that the Riot Games API returns to us. This page describes precisely which data,
      why, and what you can require in relation to it.
    </>
  ),
  sections: {
    controller: {
      title: '1. Data controller',
      body: (
        <>
          <p>
            The data controller is <strong>Wyrm Forge</strong>, a <em>société par actions simplifiée
            unipersonnelle</em> (a French simplified joint-stock company with a single shareholder)
            with share capital of €500, whose registered office is at 5 Rue du 23 Janvier,
            21000 Dijon, France. Its full registration particulars appear in our legal notice.
          </p>

          <p style={{ marginTop: 10 }}>
            For any question about your personal data:{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>. No data protection officer (DPO) has been appointed at this stage, appointment not
            being mandatory given the nature and the volume of the processing carried out.
          </p>
        </>
      ),
    },
    collected: {
      title: '2. Data we collect',
      body: (
        <>
          <p><strong>Account data</strong> — essential in order to sign you in:</p>
          <List>
            <li>email address and username;</li>
            <li>password, stored only in encrypted form by Supabase Auth (we never have access to it
              in plain text);</li>
            <li>account creation date, subscription plan and any expiry date, certification
              status.</li>
          </List>

          <p style={{ marginTop: 16 }}>
            <strong>Riot account — only if you link it voluntarily</strong>:
          </p>
          <List>
            <li>your Riot ID (game name and tag) and your game platform (for example{' '}
              <code>euw1</code>);</li>
            <li>your PUUID, the stable identifier assigned by Riot Games;</li>
            <li>the rank you declare yourself on your profile.</li>
          </List>
          <p style={{ marginTop: 8 }}>
            Linking works through a profile icon challenge: you prove the account is yours by
            temporarily changing your icon in the game. You may unlink your Riot account at any time
            from your profile page, without deleting your Wyrm Forge account.
          </p>

          <p style={{ marginTop: 16 }}><strong>Game data</strong>:</p>
          <List>
            <li>match history, statistics and team compositions retrieved on demand from the Riot
              Games API, and kept in cache for a limited time (see § 6);</li>
            <li>matches whose detail you have viewed, in order to validate the corresponding
              quests.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Players looked up — with or without a Wyrm Forge
            account</strong> — when someone looks up a player on the site or in the app, the
            official Riot Games API sends us that player&apos;s data and the data of the other
            participants in their games. These people do not necessarily have an account with us
            and did not give us this data themselves: it comes from Riot Games, which makes it
            available for any League of Legends account. It consists of:</p>
          <List>
            <li>the Riot ID (game name and tag), the PUUID (the stable identifier assigned by Riot
              Games), the region and the rank;</li>
            <li>the statistics of each game: champion, role, kills, deaths and assists, minions,
              vision score, damage, gold, items, runes, how the game unfolded.</li>
          </List>
          <p style={{ marginTop: 8 }}>We keep three things from it:</p>
          <List>
            <li>the detail of the games looked up, in cache, so as not to query Riot Games at every
              display;</li>
            <li>for players searched for by their Riot ID on the player page, one sample per game
              (PUUID, rank, role and the game&apos;s statistics). These samples are stored one by one
              and only added up when an average per rank is computed, which is shown only from 50
              games for the same rank, role and queue. They are never displayed individually;</li>
            <li>the Riot IDs actually searched for, for the search bar&apos;s autocompletion.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Content you create</strong>:</p>
          <List>
            <li>item builds, jungle paths, to-do lists, macro scenarios, match up analyses;</li>
            <li>contributions published on the Workshop, visible to other users.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Paid subscription — only if you
            subscribe</strong>:</p>
          <List>
            <li>your customer and subscription identifiers at Stripe, the tier subscribed to, the
              status of the subscription and its due dates;</li>
            <li>the proof of your request for immediate access to the service, collected before
              payment: date and time, exact wording of the box ticked and its version, display
              language, tier and billing frequency chosen, version of the terms of sale;</li>
            <li>the history of the service emails relating to your subscription (order confirmation,
              cancellation confirmation, reminder before renewal): type of email, date sent,
              destination address and sending identifier.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Scales (internal virtual currency)</strong>:</p>
          <List>
            <li>log of movements (quest rewards, shop purchases);</li>
            <li>quests completed per day, streak of consecutive days, cosmetics owned and
              equipped.</li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Public searches</strong> — the Riot IDs searched for
            on the site (region, name, tag) are stored to feed the autocompletion of the search bar.
            These entries are not associated with any account: it is impossible to know who searched
            for what. Only the Riot IDs actually searched for are listed there, not the other players
            of the games displayed.</p>

          <p style={{ marginTop: 16 }}><strong>Technical data</strong> — your IP address is used to
            limit the number of requests per visitor (abuse protection and compliance with Riot
            quotas). It is never recorded in plain text: to count your requests we only keep a
            fingerprint of it computed with a secret key, deleted at most two hours after your last
            request. It is not used for any profiling.</p>
        </>
      ),
    },
    cookies: {
      title: '3. Cookies and local storage',
      body: (
        <>
          <p>
            Only four things may be stored on or read from your device: a session cookie and a
            bot-protection cookie, both <strong>strictly necessary</strong> for the service to
            work, the <strong>consent banner</strong>, which remembers your answer so as not to
            ask you again on every visit, and Google&apos;s advertising script, which is loaded
            <strong> only with your consent</strong>. We use no audience measurement tool.
          </p>

          <p style={{ marginTop: 16 }}><strong>Strictly necessary cookies</strong> — stored
            without consent, because the service cannot work without them. Neither is used for
            advertising, nor to follow you from one site to another:</p>
          <List>
            <li><code>sb-…-auth-token</code> — session cookie issued by Supabase Auth. It keeps you
              signed in from one page to the next. Attributes <code>SameSite=Lax</code> and{' '}
              <code>Secure</code> in production. Without it, signing in is impossible.</li>
            <li><code>__cf_bm</code> — Cloudflare cookie, which filters automated traffic (bots,
              denial-of-service attacks) before it reaches the site. It carries a bot detection
              score and expires after 30 minutes of inactivity. It contains no advertising
              identifier and is never used for targeting. It is stored only when that protection
              is active on the domain.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Consent banner</strong> — stored in every case, no
            consent required:</p>
          <p>
            On your first visit, a banner asks whether you accept advertising cookies. It is
            provided by Google&apos;s consent management platform (“CMP”, compliant with the IAB
            Europe TCF framework) and records your answer on your device, so that you are not asked
            again on every page.
          </p>
          <p style={{ marginTop: 12 }}>
            That particular storage is not subject to your consent, for a simple reason: it is what
            collects that consent, and what keeps the record of your refusal. Without it, the
            question would be put to you again indefinitely.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Refusing is as simple as accepting</strong>: both choices are offered in the
            same place, on the banner itself, with no submenu to go through. You may{' '}
            <strong>change your mind at any time</strong> by clicking “Manage cookies”, at the
            bottom of any page of the site.
          </p>

          <p style={{ marginTop: 16 }}><strong>Advertising script</strong> — subject to your prior
            consent:</p>
          <p>
            Wyrm Forge is enrolled in the <strong>Google AdSense</strong> advertising programme. The
            script provided by Google is liable to store cookies and read identifiers on your device.
            It is loaded <strong>only if you have consented to it</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            For as long as you have not answered, and if you refuse: <strong>Google&apos;s script is
            not loaded, no advertising request is sent to Google from your browser and no
            advertising cookie is stored.</strong> The lock is closed by default — your silence
            counts as a refusal, never as acceptance. The slots reserved in the page then stay empty.
          </p>
          <p style={{ marginTop: 16 }}><strong>Local storage</strong> — this data stays
            <strong> on your device only</strong> and is never transmitted to us:</p>
          <List>
            <li><code>wf.matchups.v2</code> and <code>wf.matchups.v1</code> — your Match Up
              scenarios;</li>
            <li><code>wf-lang</code> and <code>wf-landing-lang</code> — your display language;</li>
            <li><code>wf.stripe.checkout-intent</code> — the tier you had just chosen, kept while you
              sign in so that payment resumes where you left it;</li>
            <li>your theme preference.</li>
          </List>
          <p style={{ marginTop: 12 }}>
            Clearing your browser data erases them permanently.
          </p>
        </>
      ),
    },
    purposes: {
      title: '4. Why we process this data',
      body: (
        <List>
          <li><strong>Performance of the contract</strong> — creating and managing your account,
            providing the tools of the service, managing any subscription, and sending you by email
            the confirmation of your order and, where applicable, of your cancellation.</li>
          <li><strong>Consent</strong> — linking your Riot account. Withdrawable at any time,
            without justification.</li>
          <li><strong>Legitimate interest</strong> — security of the service, prevention of abuse,
            compliance with the quotas imposed by Riot Games, improvement of the features.</li>
          <li><strong>Legitimate interest — players looked up</strong> — showing a player&apos;s
            game statistics to the person looking them up, and computing averages per rank. We
            consider that this interest does not unduly infringe the rights of the players
            concerned, because the data is published by Riot Games for any account, we do not link
            it to any real-world identity, it is not used for any profiling or advertising, and it
            is kept for a short time (§ 6). Each player may object to it (§ 7).</li>
          <li><strong>Legal obligation</strong> — retention of the accounting records of paid
            subscriptions, and of the proof of your request for immediate access to the service
            (article L221-25 of the French Consumer Code), which we must be able to produce in the
            event of a withdrawal or a dispute; and the reminder email sent before the renewal of an
            annual subscription (article L215-1 of the French Consumer Code).</li>
        </List>
      ),
    },
    sharing: {
      title: '5. Who this data is shared with',
      body: (
        <>
          <p>
            We neither sell nor rent any data, and we pass none of it on for advertising purposes. We
            use the following technical providers, each strictly for the purpose indicated:
          </p>
          <List>
            <li><strong>Supabase</strong> — hosting of the database, of authentication and of files,
              and sending of the emails relating to your account (sign-up confirmation, password
              reset). This is where your account and your content reside. <strong>The project is
              hosted in Ireland, in the European Union</strong>: your data is stored and processed
              there.</li>
            <li><strong>Vercel</strong> — hosting and delivery of the website.</li>
            <li><strong>Cloudflare</strong> — delivery of the site and protection against
              denial-of-service attacks and automated traffic. Every request to wyrm-forge.com
              passes through its network before reaching the hosting provider: it therefore sees
              your IP address and the technical headers of your request. It receives no data from
              your account, and none of the content you have created.</li>
            <li><strong>Riot Games</strong> — the official League of Legends API. Our servers send it
              your Riot ID or your PUUID to retrieve your game data. These exchanges are governed by
              the Riot Games privacy policy.</li>
            <li><strong>Anthropic</strong> — generation of the AI analyses (Match Up, post-game
              review, patch note summaries). Only the necessary context is sent: for a Match Up, the
              champions, levels and items of the simulation; for a post-game review, the facts of
              the game analysed (champion, role, statistics, items, runes, deaths, objectives and,
              depending on the option chosen, those of the lane opponent). No Riot ID, no PUUID, no
              email address.</li>
            <li><strong>Stripe</strong> — processing of subscription payments, billing and
              subscription management portal. We store no bank card data: it is entered directly with
              Stripe.</li>
            <li><strong>Resend</strong> — sending of the transactional emails relating to your
              subscription (order confirmation, cancellation confirmation, reminder before renewal).
              It receives your email address and the content of the message, nothing else.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Where your data is, and what leaves the EU</strong></p>
          <p>
            The place of storage and the nationality of the provider are two distinct questions, and
            they do not have the same answer:
          </p>
          <List>
            <li><strong>Supabase</strong> — your data is stored <strong>in Ireland, in the
              EU</strong>. But the company that operates the service, Supabase, Inc., is established
              in Singapore, a country that does not benefit from an adequacy decision of the European
              Commission. Access from outside the EU therefore remains possible, in particular for
              technical administration and support. That access is framed by the European
              Commission&apos;s standard contractual clauses, incorporated into Supabase&apos;s data
              processing agreement (DPA).</li>
            <li><strong>Cloudflare</strong> — the same distinction as for Supabase, the other
              way round: the company is established <strong>in the United States</strong>, but
              European traffic is handled by its <strong>edge servers located in the EU</strong>,
              as close as possible to the visitor. Transfers that leave the EU rely on the same
              safeguards as below.</li>
            <li><strong>The other providers</strong> — Vercel, Stripe, Anthropic and Resend are
              established in the United States. The corresponding transfers rely on the European
              Commission&apos;s standard contractual clauses and, for those certified under it, on
              the EU–US Data Privacy Framework.</li>
          </List>
          <p style={{ marginTop: 12 }}>
            You may ask us for a copy of the safeguards framing these transfers by writing to{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>.
          </p>
        </>
      ),
    },
    retention: {
      title: '6. How long we keep it',
      body: (
        <List>
          <li><strong>Account and content</strong> — for as long as your account exists. After a
            deletion request, permanent erasure within 30 days at most.</li>
          <li><strong>Cache of Riot data</strong> — from a few minutes to 30 days depending on the
            type of data (30 days for the detail of a game), then deleted within the following 48
            hours. This delay lets us keep showing the data if the day&apos;s Riot call quota is
            exhausted. It is a technical cache, not an archive.</li>
          <li><strong>Performance samples by rank</strong> — one year at most, then deleted
            automatically.</li>
          <li><strong>Matches whose detail you have viewed</strong> — 30 days.</li>
          <li><strong>IP address fingerprints</strong> — two hours at most.</li>
          <li><strong>Scales log</strong> — kept for as long as the account exists, to guarantee the
            integrity of the balance; deleted with the account.</li>
          <li><strong>Subscription data</strong> — for as long as the account exists; deleted with
            the account. Invoices are kept by Stripe for the period required by accounting
            obligations (10 years).</li>
          <li><strong>Proof of your request for immediate access</strong> — 5 years from your
            subscription (the limitation period for civil claims), so that it can be produced in the
            event of a dispute. If your account is deleted before then, the proof is kept for the
            same period, but detached from your account.</li>
          <li><strong>History of subscription emails</strong> — 5 years from sending, so that we can
            prove that the legal information was indeed sent to you. If your account is deleted
            before then, the history is kept for the same period, detached from your account; an
            email that had not yet gone out is never sent.</li>
          <li><strong>Riot IDs searched for (autocompletion)</strong> — 6 months after the last
            search. These are game identifiers, not attached to a Wyrm Forge account.</li>
        </List>
      ),
    },
    rights: {
      title: '7. Your rights',
      body: (
        <>
          <p>
            In accordance with the GDPR, you have the rights of access, rectification, erasure,
            restriction, objection and portability, as well as the right to withdraw your consent at
            any time.
          </p>
          <List>
            <li><strong>Access and rectification</strong> — most of your data can be viewed and
              changed from your profile page (username, declared rank, Riot link).</li>
            <li><strong>Erasure</strong> — a dedicated button on your profile page opens an account
              deletion request, processed within 30 days (article 17 of the GDPR). It entails the
              deletion of your profile, your content, your public contributions and the link to your
              Riot account. You may cancel your request for as long as it has not been
              processed.</li>
            <li><strong>Portability</strong> — write to us at contact@wyrm-forge.com to receive a
              copy of your data in a structured, machine-readable format.</li>
            <li><strong>Withdrawal of consent</strong> — unlink your Riot account from your profile,
              at any time and without justification.</li>
            <li><strong>You don&apos;t have a Wyrm Forge account?</strong> — your rights of access,
              erasure and objection also apply to the data described in § 2 &quot;Players looked
              up&quot;. Write to us at contact@wyrm-forge.com stating your Riot ID and your region.
              We may ask you to prove that this Riot account is yours. We then delete, within one
              month, the samples linked to your PUUID, the cached games concerning you and your
              Riot ID from the autocompletion. So that your objection holds over time, we keep only
              your PUUID in an exclusion list, and no sample or autocompletion entry is created in
              your name any more.</li>
          </List>
          <p style={{ marginTop: 12 }}>
            We answer every request within one month. If you consider that your rights are not being
            respected, you may lodge a complaint with the CNIL, the French data protection authority
            (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>www.cnil.fr</a>).
          </p>
        </>
      ),
    },
    security: {
      title: '8. Security',
      body: (
        <>
          <p>
            Exchanges with the site are encrypted over HTTPS. Access to the data in the database is
            restricted row by row: by construction, a user can read only their own data. Sensitive
            API keys (Riot Games, Anthropic, Stripe) remain exclusively on the server side and are
            never exposed to the browser.
          </p>
          <p style={{ marginTop: 10 }}>
            No system is infallible. In the event of a data breach likely to create a risk to your
            rights, we will inform the CNIL and, where applicable, the individuals concerned, within
            the time limits provided by the GDPR.
          </p>
        </>
      ),
    },
    minors: {
      title: '9. Minors',
      body: (
        <p>
          The service is not intended for children under 15. If you are between 15 and 18, we
          recommend that you use Wyrm Forge with the agreement of your parents or of your legal
          guardian. If we learn that an account has been created by a child under 15 without
          parental authorisation, we will delete it.
        </p>
      ),
    },
    changes: {
      title: '10. Changes',
      body: (
        <p>
          This policy may change, in particular as the service leaves its beta phase and as new
          features appear. The date of the last update appears at the top of this page. In the event
          of a substantial change, users holding an account will be informed by email.
        </p>
      ),
    },
  },
}

export const confidentialiteDicts: Record<Lang, ConfidentialiteDict> = {
  fr: confidentialiteFr,
  en: confidentialiteEn,
}

/**
 * Dictionnaire des politique de confidentialité dans la langue courante.
 *
 * Un hook PAR DOCUMENT, et pas un `useLegal()` global : chaque page légale est
 * une route distincte, et un hook global ferait entrer les quatre documents dans
 * le bundle de chacune. Même raisonnement que `useDashboard()` vs la vitrine.
 */
export const useConfidentialite = (): ConfidentialiteDict => confidentialiteDicts[useLanguage().lang]

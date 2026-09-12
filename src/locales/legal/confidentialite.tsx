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
  updated: '2026-09-11',
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
              l&apos;API Riot Games, mis en cache quelques minutes pour ne pas saturer cette API ;</li>
            <li>échantillons de performance agrégés par rang (dégâts, vision, CS par minute…),
              utilisés uniquement pour calculer des moyennes par palier. Ces échantillons ne sont
              jamais affichés individuellement ;</li>
            <li>parties dont tu as consulté le détail, afin de valider les quêtes correspondantes.</li>
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
            savoir qui a recherché quoi.</p>

          <p style={{ marginTop: 16 }}><strong>Données techniques</strong> — ton adresse IP est
            utilisée de manière transitoire pour limiter le nombre de requêtes par visiteur
            (protection anti-abus et respect des quotas Riot). Elle n&apos;est pas conservée dans un
            journal consultable et ne sert à aucun profilage.</p>
        </>
      ),
    },
    cookies: {
      title: '3. Cookies et stockage local',
      body: (
        <>
          <p>
            Deux choses seulement peuvent être déposées ou lues sur ton appareil : un cookie de
            session <strong>strictement nécessaire</strong> au fonctionnement du service, et le
            script publicitaire de Google, qui n&apos;est chargé <strong>qu&apos;avec ton
            consentement</strong>. Nous n&apos;utilisons aucun outil de mesure d&apos;audience.
          </p>

          <p style={{ marginTop: 16 }}><strong>Cookie strictement nécessaire</strong> — déposé
            dans tous les cas, aucun consentement requis :</p>
          <List>
            <li><code>sb-…-auth-token</code> — cookie de session émis par Supabase Auth. Il te
              maintient connecté d&apos;une page à l&apos;autre. Attributs <code>SameSite=Lax</code>
              et <code>Secure</code> en production. Sans lui, la connexion est impossible.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Script publicitaire</strong> — soumis à ton
            consentement préalable :</p>
          <p>
            Wyrm Forge est inscrit au programme publicitaire <strong>Google AdSense</strong>. Le
            script fourni par Google est susceptible de déposer des cookies et de lire des
            identifiants sur ton appareil. Il n&apos;est chargé <strong>que si tu y as
            consenti</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            Le bandeau de recueil du consentement (CMP) est encore en cours de mise en place.
            Tant qu&apos;il n&apos;est pas déployé, aucun consentement ne peut être recueilli, et le
            verrou reste donc fermé par défaut : <strong>le script de Google n&apos;est pas chargé,
            aucune requête n&apos;est envoyée à Google depuis ton navigateur et aucun cookie
            publicitaire n&apos;est déposé.</strong> Aucune publicité n&apos;est diffusée à ce jour.
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
            <li><strong>Riot Games</strong> — l&apos;API officielle de League of Legends. Nos serveurs
              lui transmettent ton Riot ID ou ton PUUID pour récupérer tes données de jeu.
              Ces échanges sont régis par la politique de confidentialité de Riot Games.</li>
            <li><strong>Anthropic</strong> — génération des analyses IA (Match Up, résumés de patch
              notes). Seul le contexte de la simulation est envoyé (champions, niveaux, objets) ;
              aucun identifiant de compte, aucune adresse e-mail.</li>
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
            <li><strong>Les autres prestataires</strong> — Vercel, Stripe, Anthropic et Resend sont
              établis aux États-Unis. Les transferts correspondants s&apos;appuient sur les clauses
              contractuelles types de la Commission européenne et, pour ceux qui y sont certifiés,
              sur le cadre de protection des données UE–États-Unis (Data Privacy Framework).</li>
          </List>
          {/* À COMPLÉTER PAR HORTAL — vérifier et consigner, prestataire par prestataire :
              (1) que le DPA de Supabase est bien signé et quelle version des CCT il intègre ;
              (2) lesquels de Vercel / Stripe / Anthropic / Resend sont effectivement certifiés
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
          <li><strong>Cache des données Riot</strong> — de quelques minutes à quelques heures selon
            le type de donnée. Il s&apos;agit d&apos;un cache technique, pas d&apos;un archivage.</li>
          <li><strong>Échantillons de performance par rang</strong> — un an au maximum,
            puis purge.</li>
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
          <li><strong>Riot ID recherchés (autocomplétion)</strong> — conservés sans limite de durée.
            Il s&apos;agit d&apos;identifiants de jeu publics, non rattachés à un compte Wyrm Forge.</li>
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
  updated: '2026-09-11',
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
              Games API, cached for a few minutes so as not to saturate that API;</li>
            <li>performance samples aggregated by rank (damage, vision, CS per minute, etc.), used
              solely to compute averages per rank. These samples are never displayed
              individually;</li>
            <li>matches whose detail you have viewed, in order to validate the corresponding
              quests.</li>
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
            for what.</p>

          <p style={{ marginTop: 16 }}><strong>Technical data</strong> — your IP address is used
            transiently to limit the number of requests per visitor (abuse protection and compliance
            with Riot quotas). It is not kept in a consultable log and is not used for any
            profiling.</p>
        </>
      ),
    },
    cookies: {
      title: '3. Cookies and local storage',
      body: (
        <>
          <p>
            Only two things may be stored on or read from your device: a session cookie that is
            <strong> strictly necessary</strong> for the service to work, and Google&apos;s
            advertising script, which is loaded <strong>only with your consent</strong>. We use no
            audience measurement tool.
          </p>

          <p style={{ marginTop: 16 }}><strong>Strictly necessary cookie</strong> — stored in every
            case, no consent required:</p>
          <List>
            <li><code>sb-…-auth-token</code> — session cookie issued by Supabase Auth. It keeps you
              signed in from one page to the next. Attributes <code>SameSite=Lax</code> and{' '}
              <code>Secure</code> in production. Without it, signing in is impossible.</li>
          </List>
          <p style={{ marginTop: 16 }}><strong>Advertising script</strong> — subject to your prior
            consent:</p>
          <p>
            Wyrm Forge is enrolled in the <strong>Google AdSense</strong> advertising programme. The
            script provided by Google is liable to store cookies and read identifiers on your device.
            It is loaded <strong>only if you have consented to it</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            The consent banner (CMP) is still being put in place. Until it is deployed, no consent
            can be collected, and the lock therefore stays closed by default: <strong>Google&apos;s
            script is not loaded, no request is sent to Google from your browser and no advertising
            cookie is stored.</strong> No advertising is served at this time.
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
            <li><strong>Riot Games</strong> — the official League of Legends API. Our servers send it
              your Riot ID or your PUUID to retrieve your game data. These exchanges are governed by
              the Riot Games privacy policy.</li>
            <li><strong>Anthropic</strong> — generation of the AI analyses (Match Up, patch note
              summaries). Only the context of the simulation is sent (champions, levels, items); no
              account identifier, no email address.</li>
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
          <li><strong>Cache of Riot data</strong> — from a few minutes to a few hours depending on
            the type of data. It is a technical cache, not an archive.</li>
          <li><strong>Performance samples by rank</strong> — one year at most, then purged.</li>
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
          <li><strong>Riot IDs searched for (autocompletion)</strong> — kept without a time limit.
            These are public game identifiers, not attached to a Wyrm Forge account.</li>
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

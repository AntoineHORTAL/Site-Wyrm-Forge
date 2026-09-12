'use client'

import Link from 'next/link'
import { List, Todo } from '@/components/legal/LegalBlocks'
import {
  SubscriptionOffer,
  PaymentTerms,
  CancellationTerms,
  UnpaidPolicy,
} from '@/components/legal/SubscriptionTerms'
import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

/**
 * Conditions générales d'utilisation — texte FR et EN.
 *
 * Conventions de traduction : voir l'en-tête de `./mentions`.
 *
 * ⚠️ Les clauses d'abonnement du § 8 ne sont PAS recopiées ici : elles sont
 * rendues par `<SubscriptionOffer />`, `<PaymentTerms />`, `<CancellationTerms />`
 * et `<UnpaidPolicy />`, partagées avec les CGV. Un § 8 qui redirait le prix ou la
 * reconduction dans ses propres mots finirait par contredire les CGV — et c'est
 * la version la moins favorable au professionnel qui l'emporterait (art. L211-1).
 */

export const cguFr = {
  title: 'Conditions générales',
  accent: "d'utilisation",
  /** ISO — formatée dans la langue lue par `LegalPage`. */
  updated: '2026-09-11',
  intro: (
    <>
      Ces conditions encadrent l&apos;utilisation du site wyrm-forge.com et de l&apos;application
      de bureau Wyrm Forge. En créant un compte ou en utilisant le service, tu les acceptes
      dans leur intégralité. Si tu n&apos;es pas d&apos;accord avec l&apos;une d&apos;elles,
      n&apos;utilise pas le service.
    </>
  ),
  sections: {
    scope: {
      title: '1. Objet du service',
      body: (
        <>
          <p>
            Wyrm Forge est un assistant de jeu pour League of Legends. Il propose notamment un
            éditeur de builds d&apos;items, un éditeur de jungle paths, des to-do lists, des
            scénarios de macro, des analyses de match up assistées par IA, ainsi que la
            consultation d&apos;historiques de parties et de parties en cours.
          </p>
          <p style={{ marginTop: 10 }}>
            Le service est accessible via le site web et via une application de bureau Windows.
            Les deux partagent le même compte.
          </p>
        </>
      ),
    },
    beta: {
      title: '2. Statut bêta',
      body: (
        <>
          <p>
            <strong>Wyrm Forge est actuellement en bêta.</strong> Concrètement, cela signifie que :
          </p>
          <List>
            <li>des fonctionnalités peuvent être ajoutées, modifiées ou retirées sans préavis ;</li>
            <li>des interruptions de service, des lenteurs et des erreurs sont possibles ;</li>
            <li>certaines données créées pendant la bêta peuvent être réinitialisées, en particulier
              les soldes d&apos;Écailles et les données de test ;</li>
            <li>le service est fourni « en l&apos;état », sans garantie de disponibilité ni
              d&apos;exactitude des informations affichées.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Nous nous efforçons de prévenir les utilisateurs des changements importants, mais aucun
            engagement de niveau de service n&apos;est pris pendant cette phase.
          </p>
          {/* Réserve pour la partie PAYANTE — sans elle, les clauses ci-dessus
              (retrait sans préavis, réinitialisation, « en l'état ») opposées à un
              consommateur qui paie tomberaient sous l'art. R212-1 (clauses noires :
              modification unilatérale des caractéristiques du service, suppression
              du droit à réparation). Elles restent valables pour le gratuit ; le
              comportement produit ne change pas. */}
          <p style={{ marginTop: 10 }}>
            <strong>Ce que le statut bêta ne change pas pour un abonné payant.</strong> Les points
            ci-dessus s&apos;appliquent au service gratuit. Ils ne privent pas l&apos;abonné à une
            formule payante des garanties légales de conformité des services numériques (articles
            L224-25-1 et suivants du Code de la consommation), rappelées dans les{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
            vente</Link>. En particulier, pendant toute la durée d&apos;un abonnement :
          </p>
          <List>
            <li>les caractéristiques essentielles du palier souscrit, telles que décrites au jour de
              la souscription, restent fournies jusqu&apos;à la fin de la période payée ; une
              modification qui les réduirait de manière significative n&apos;intervient qu&apos;après
              information préalable, et ouvre le droit de résilier sans frais ;</li>
            <li>les contenus que l&apos;abonné a créés (builds, jungle paths, to-do lists,
              scénarios…) ne sont pas réinitialisés ;</li>
            <li>une indisponibilité prolongée ou répétée qui le prive des caractéristiques
              essentielles de son palier constitue un défaut de conformité, qui lui ouvre les
              recours prévus par la loi (mise en conformité, réduction du prix ou résolution du
              contrat).</li>
          </List>
          <p style={{ marginTop: 10 }}>
            La réinitialisation des soldes d&apos;Écailles reste possible pour tous les comptes :
            il s&apos;agit d&apos;une monnaie virtuelle gratuite, sans valeur monétaire et non
            incluse dans les formules payantes (voir l&apos;article 7).
          </p>
        </>
      ),
    },
    account: {
      title: '3. Compte utilisateur',
      body: (
        <List>
          <li>La création d&apos;un compte requiert une adresse e-mail valide et un nom
            d&apos;utilisateur.</li>
          <li>Le service n&apos;est pas destiné aux moins de 15 ans. Entre 15 et 18 ans,
            l&apos;utilisation est recommandée avec l&apos;accord d&apos;un représentant légal.</li>
          <li>Un compte est personnel. Le partage, la revente ou la cession d&apos;un compte est
            interdit.</li>
          <li>Tu es responsable de la confidentialité de ton mot de passe et de toute activité
            réalisée depuis ton compte. Préviens-nous sans délai en cas d&apos;usage non autorisé.</li>
          <li>Les informations fournies doivent être exactes et tenues à jour.</li>
        </List>
      ),
    },
    riotLink: {
      title: '4. Liaison du compte Riot',
      body: (
        <>
          <p>
            Lier ton compte Riot est facultatif. Certaines fonctionnalités (quêtes, statistiques
            personnalisées, suivi de partie en cours) ne sont accessibles qu&apos;une fois cette
            liaison effectuée. Elle repose sur une vérification par icône de profil, qui prouve que
            tu contrôles bien le compte de jeu concerné.
          </p>
          <p style={{ marginTop: 10 }}>
            Un compte Riot ne peut être associé qu&apos;à un seul compte Wyrm Forge. Tu peux délier
            ton compte Riot à tout moment depuis ta page profil.
          </p>
        </>
      ),
    },
    rules: {
      title: '5. Règles d’utilisation',
      body: (
        <>
          <p>En utilisant Wyrm Forge, tu t&apos;engages à ne pas :</p>
          <List>
            <li>tenter d&apos;accéder à des données ou à des espaces qui ne te sont pas destinés ;</li>
            <li>automatiser, extraire massivement ou revendre les données du service, ni contourner
              les limitations de requêtes mises en place ;</li>
            <li>usurper l&apos;identité d&apos;un autre joueur ou d&apos;un membre de
              l&apos;équipe ;</li>
            <li>publier des contenus illicites, haineux, diffamatoires, harcelants ou portant
              atteinte aux droits de tiers ;</li>
            <li>perturber le fonctionnement du service ou de son infrastructure.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Wyrm Forge est un outil d&apos;analyse et de préparation. Il ne modifie pas le jeu, ne
            fournit aucun avantage automatisé en partie et ne doit pas être utilisé en violation des
            conditions d&apos;utilisation de Riot Games.
          </p>
        </>
      ),
    },
    userContent: {
      title: '6. Contenus publiés par les utilisateurs',
      body: (
        <>
          <p>
            Tu restes propriétaire des contenus que tu crées. En les publiant sur les espaces
            communautaires (Workshop), tu accordes à Wyrm Forge une licence non exclusive
            et gratuite permettant leur affichage au sein du service, pour la durée de leur
            publication.
          </p>
          <p style={{ marginTop: 10 }}>
            Tu es seul responsable des contenus que tu publies. Nous nous réservons le droit de
            retirer sans préavis tout contenu contraire aux présentes conditions ou à la loi.
          </p>
        </>
      ),
    },
    scales: {
      title: '7. Écailles — monnaie virtuelle',
      body: (
        <>
          <p>
            Les « Écailles » sont une unité de compte purement interne au service, gagnée via les
            quêtes et dépensée dans la boutique de cosmétiques. Sur ce point, les règles sont
            strictes et sans exception :
          </p>
          <List>
            <li>les Écailles <strong>n&apos;ont aucune valeur monétaire</strong> et ne constituent ni
              de la monnaie électronique, ni un moyen de paiement ;</li>
            <li>elles <strong>ne sont ni convertibles ni échangeables contre de l&apos;argent
              réel</strong>, ni contre aucun bien ou service extérieur à Wyrm Forge ;</li>
            <li>elles <strong>ne sont pas remboursables</strong>, en aucune circonstance ;</li>
            <li>elles ne peuvent pas être transférées, vendues ou cédées à un autre utilisateur ;</li>
            <li>elles ne confèrent aucun droit de propriété : il s&apos;agit d&apos;une licence
              d&apos;usage limitée au sein du service ;</li>
            <li>elles peuvent être ajustées, suspendues ou annulées en cas de fraude, d&apos;abus ou
              d&apos;anomalie technique ;</li>
            <li>les barèmes de gain, les prix de la boutique et les plafonds journaliers peuvent
              évoluer à tout moment ;</li>
            <li>le solde et les cosmétiques associés sont définitivement perdus à la fermeture du
              compte, quelle qu&apos;en soit la cause.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Les Écailles ne sont pas achetables avec de l&apos;argent réel. Si cette possibilité était
            introduite un jour, ces conditions seraient mises à jour au préalable.
          </p>
        </>
      ),
    },
    subscriptions: {
      title: '8. Abonnements payants',
      body: (
        <>
          <p>
            En plus de l&apos;offre gratuite, Wyrm Forge propose des abonnements payants, avec une
            facturation mensuelle ou annuelle. Leurs conditions de vente complètes — commande,
            droit de rétractation, garanties légales, réclamations — figurent dans nos{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
            vente</Link>, qui prévalent sur le présent article pour tout ce qui concerne la vente.
          </p>

          <p style={{ marginTop: 16 }}><strong>Paliers et prix</strong></p>
          <SubscriptionOffer />

          <p style={{ marginTop: 16 }}><strong>Paiement et renouvellement</strong></p>
          <PaymentTerms />

          <p style={{ marginTop: 16 }}><strong>Durée et résiliation</strong></p>
          <CancellationTerms />

          <p style={{ marginTop: 16 }}><strong>En cas d&apos;impayé</strong></p>
          <UnpaidPolicy />

          <p style={{ marginTop: 16 }}><strong>Droit de rétractation</strong></p>
          <p>
            Tu disposes d&apos;un délai de rétractation de 14 jours à compter de ta souscription
            (article L221-18 du Code de la consommation). Avant le paiement, nous te demandons de
            confirmer expressément que tu souhaites accéder au service immédiatement : si tu te
            rétractes ensuite dans ce délai, tu es remboursé, déduction faite du montant
            correspondant au service fourni jusqu&apos;à ta rétractation. Les modalités et le
            formulaire de rétractation figurent dans les{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
            vente</Link>.
          </p>
        </>
      ),
    },
    availability: {
      title: '9. Disponibilité et responsabilité',
      body: (
        <>
          {/* Nuance « payant » : un « sans que notre responsabilité puisse être
              engagée » opposé à un consommateur qui paie supprime son droit à
              réparation — clause noire, art. R212-1 6°. Réécrit pour décrire la
              dépendance aux tiers sans exclure la responsabilité légale. */}
          <p>
            Wyrm Forge dépend de services tiers, en particulier de l&apos;API de Riot Games. Une
            indisponibilité, un changement ou une limitation imposée par ces services peut dégrader
            ou interrompre tout ou partie des fonctionnalités. <strong>Le service gratuit est fourni
            « en l&apos;état »</strong>, sans garantie de disponibilité.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>Pour un abonnement payant</strong>, cette mention ne limite ni les garanties
            légales de conformité (articles L224-25-1 et suivants du Code de la consommation), ni
            ton droit à réparation lorsque la loi te l&apos;accorde. Une interruption due à un
            événement de force majeure, ou à la décision d&apos;un tiers qui nous est
            extérieure et que nous ne pouvions pas prévenir, ne constitue pas en elle-même un
            manquement de notre part ; si elle te prive durablement des caractéristiques
            essentielles de ton palier, tu peux résilier sans frais et obtenir le remboursement de
            la part non consommée de la période payée.
          </p>
          <p style={{ marginTop: 10 }}>
            Les analyses, statistiques et recommandations fournies — y compris celles générées par
            IA — sont indicatives : nous ne garantissons aucun résultat en jeu.
          </p>
          <p style={{ marginTop: 10 }}>
            Sauf faute lourde ou intentionnelle de notre part, nous ne répondons pas des dommages
            indirects, de la perte de données résultant d&apos;une utilisation non conforme, ni des
            conséquences d&apos;une sanction prononcée par Riot Games à l&apos;encontre d&apos;un
            compte de jeu du fait de son titulaire.
          </p>
        </>
      ),
    },
    termination: {
      title: '10. Résiliation',
      body: (
        <>
          <p><strong>Résilier un abonnement payant</strong> — voir l&apos;article 8 « Durée et
            résiliation » : depuis ta page profil, en quelques clics, avec effet à la fin de la
            période déjà payée.</p>
          {/* Mécanisme RÉEL : `cancel_at_period_end` (portail Stripe configuré
              `at_period_end`, proration `none`). Aucun prorata n'est implémenté
              pour une résiliation ordinaire — le texte d'avant (« prorata non
              consommé ») promettait un remboursement qui n'existe pas. Les
              exceptions listées sont celles que la LOI impose, elles se traitent
              à la main (remboursement partiel depuis le Dashboard Stripe). */}
          <p style={{ marginTop: 10 }}>
            <strong>Remboursement</strong> — la résiliation d&apos;un abonnement ne donne lieu à
            <strong> aucun remboursement partiel</strong> : elle prend effet à la fin de la période
            déjà payée, pendant laquelle tu conserves l&apos;accès à ton palier. Cette règle ne
            fait pas obstacle aux remboursements prévus par la loi, qui restent dus dans les
            conditions décrites par les{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
            vente</Link> : exercice du droit de rétractation dans les 14 jours, défaut de
            conformité du service, ou absence d&apos;information préalable avant le renouvellement
            d&apos;un abonnement annuel.
          </p>
          <p style={{ marginTop: 10 }}><strong>Fermer ton compte</strong> — tu peux fermer ton
            compte à tout moment depuis ta page profil. La demande est traitée sous 30 jours et
            entraîne la suppression de ton profil, de tes contenus, de tes contributions publiques
            et de ton solde d&apos;Écailles. Tu peux annuler ta demande tant qu&apos;elle n&apos;a
            pas été traitée.</p>
          {/* Décision HORTAL du 2026-09-11 : fin de période DÈS LA DEMANDE —
              `/api/account/deletion-request` + `account-deletion.ts`. Filet dans le
              webhook pour un compte supprimé sans demande. */}
          <p style={{ marginTop: 10 }}>
            Si un abonnement payant est en cours, ta demande de fermeture le résilie
            immédiatement pour l&apos;avenir : <strong>plus aucun prélèvement n&apos;a lieu</strong>,
            et tu conserves l&apos;accès déjà payé jusqu&apos;à la fin de la période en cours, ou
            jusqu&apos;à la suppression effective du compte si elle intervient avant. La période
            déjà payée n&apos;est pas remboursée ; tu peux toutefois exercer ton droit de
            rétractation s&apos;il est encore ouvert (voir les conditions générales de vente). Si tu
            annules ta demande de fermeture, l&apos;abonnement reste résilié à son échéance : tu peux
            le réactiver depuis le portail de facturation avant cette date.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>À notre initiative</strong> — nous pouvons suspendre ou fermer un compte en cas
            de manquement aux présentes conditions, de fraude, d&apos;abus ou d&apos;activité
            illicite. Sauf urgence ou obligation légale, une notification préalable est envoyée à
            l&apos;adresse e-mail associée au compte. Si nous fermons un compte payant pour un motif
            qui ne t&apos;est pas imputable, la part non consommée de la période payée t&apos;est
            remboursée.
          </p>
          <p style={{ marginTop: 10 }}>
            Dans tous les cas, la fermeture entraîne la perte définitive des Écailles et des
            cosmétiques associés, sans contrepartie.
          </p>
        </>
      ),
    },
    riotDisclaimer: {
      title: '11. Non-affiliation à Riot Games',
      body: (
        <>
          <p>
            Wyrm Forge n&apos;est pas affilié, sponsorisé ni approuvé par Riot Games, Inc. ou
            l&apos;une de ses filiales. League of Legends et Riot Games sont des marques ou marques
            déposées de Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
          <p style={{ marginTop: 10 }}>
            L&apos;utilisation de Wyrm Forge ne te dispense pas de respecter les conditions
            d&apos;utilisation de Riot Games. Toute utilisation du service à des fins de triche,
            d&apos;automatisation du jeu ou de contournement des règles de Riot Games est interdite.
          </p>
        </>
      ),
    },
    changes: {
      title: '12. Modification des conditions',
      body: (
        <p>
          Ces conditions peuvent être modifiées, notamment à la sortie de la bêta. La date de
          dernière mise à jour figure en haut de cette page. En cas de modification substantielle,
          les titulaires d&apos;un compte en sont informés par e-mail. La poursuite de
          l&apos;utilisation du service après cette information vaut acceptation. Les évolutions
          de prix ou de contenu d&apos;un abonnement en cours obéissent aux règles propres des{' '}
          <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
          vente</Link> (information préalable et droit de résilier sans frais).
        </p>
      ),
    },
    disputes: {
      title: '13. Droit applicable et litiges',
      body: (
        <>
          <p>
            Les présentes conditions sont soumises au droit français. En cas de litige, une solution
            amiable sera recherchée en priorité : écris-nous à{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>.
          </p>
          <p style={{ marginTop: 10 }}>
            Conformément à l&apos;article L612-1 du Code de la consommation, tout consommateur peut
            recourir gratuitement à un médiateur de la consommation :{' '}
            <Todo>désigner un médiateur de la consommation avant l&apos;ouverture des offres payantes</Todo>
          </p>
          <p style={{ marginTop: 10 }}>
            À défaut de résolution amiable, le litige sera porté devant les juridictions françaises
            compétentes.
          </p>
        </>
      ),
    },
  },
}

export type CguDict = typeof cguFr

export const cguEn: CguDict = {
  title: 'Terms of',
  accent: 'use',
  updated: '2026-09-11',
  intro: (
    <>
      These terms govern the use of the wyrm-forge.com website and of the Wyrm Forge desktop
      application. By creating an account or using the service, you accept them in full. If you
      disagree with any of them, do not use the service.
    </>
  ),
  sections: {
    scope: {
      title: '1. Purpose of the service',
      body: (
        <>
          <p>
            Wyrm Forge is a companion tool for League of Legends. It offers, among other things, an
            item build editor, a jungle path editor, to-do lists, macro scenarios, AI-assisted match
            up analyses, and access to match history and to games in progress.
          </p>
          <p style={{ marginTop: 10 }}>
            The service is available through the website and through a Windows desktop application.
            Both share the same account.
          </p>
        </>
      ),
    },
    beta: {
      title: '2. Beta status',
      body: (
        <>
          <p>
            <strong>Wyrm Forge is currently in beta.</strong> In practical terms, this means that:
          </p>
          <List>
            <li>features may be added, changed or removed without notice;</li>
            <li>service interruptions, slowdowns and errors are possible;</li>
            <li>some data created during the beta may be reset, in particular Scale balances and
              test data;</li>
            <li>the service is provided “as is”, with no guarantee of availability nor of the
              accuracy of the information displayed.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            We endeavour to warn users of significant changes, but no service level commitment is
            given during this phase.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>What beta status does not change for a paying subscriber.</strong> The points
            above apply to the free service. They do not deprive a subscriber to a paid plan of the
            statutory guarantees of conformity for digital services (articles L224-25-1 et seq. of
            the French Consumer Code), restated in our{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>terms of sale</Link>. In
            particular, throughout the term of a subscription:
          </p>
          <List>
            <li>the essential characteristics of the tier subscribed to, as described on the day of
              subscription, continue to be supplied until the end of the period paid for; a change
              that would significantly reduce them takes effect only after prior information, and
              opens the right to cancel free of charge;</li>
            <li>the content the subscriber has created (builds, jungle paths, to-do lists,
              scenarios, etc.) is not reset;</li>
            <li>a prolonged or repeated unavailability that deprives the subscriber of the essential
              characteristics of their tier constitutes a lack of conformity, which opens the
              remedies provided by law (bringing into conformity, price reduction or termination of
              the contract).</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Resetting Scale balances remains possible for every account: Scales are a free virtual
            currency, with no monetary value, and are not included in the paid plans (see article 7).
          </p>
        </>
      ),
    },
    account: {
      title: '3. User account',
      body: (
        <List>
          <li>Creating an account requires a valid email address and a username.</li>
          <li>The service is not intended for people under 15. Between 15 and 18, use is
            recommended with the agreement of a legal guardian.</li>
          <li>An account is personal. Sharing, reselling or transferring an account is
            prohibited.</li>
          <li>You are responsible for keeping your password confidential and for any activity
            carried out from your account. Tell us without delay in the event of unauthorised
            use.</li>
          <li>The information provided must be accurate and kept up to date.</li>
        </List>
      ),
    },
    riotLink: {
      title: '4. Linking your Riot account',
      body: (
        <>
          <p>
            Linking your Riot account is optional. Some features (quests, personalised statistics,
            live game tracking) are available only once that link has been made. It relies on
            verification by profile icon, which proves that you control the game account concerned.
          </p>
          <p style={{ marginTop: 10 }}>
            A Riot account may be associated with only one Wyrm Forge account. You may unlink your
            Riot account at any time from your profile page.
          </p>
        </>
      ),
    },
    rules: {
      title: '5. Rules of use',
      body: (
        <>
          <p>When using Wyrm Forge, you undertake not to:</p>
          <List>
            <li>attempt to access data or areas that are not intended for you;</li>
            <li>automate, mass-extract or resell the data of the service, nor circumvent the
              request limits that are in place;</li>
            <li>impersonate another player or a member of the team;</li>
            <li>publish content that is unlawful, hateful, defamatory, harassing, or that infringes
              the rights of third parties;</li>
            <li>disrupt the operation of the service or of its infrastructure.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Wyrm Forge is an analysis and preparation tool. It does not modify the game, provides no
            automated in-game advantage, and must not be used in breach of the Riot Games terms of
            service.
          </p>
        </>
      ),
    },
    userContent: {
      title: '6. Content published by users',
      body: (
        <>
          <p>
            You remain the owner of the content you create. By publishing it in the community areas
            (Workshop), you grant Wyrm Forge a non-exclusive, royalty-free licence allowing it to be
            displayed within the service, for the duration of its publication.
          </p>
          <p style={{ marginTop: 10 }}>
            You alone are responsible for the content you publish. We reserve the right to remove
            without notice any content that breaches these terms or the law.
          </p>
        </>
      ),
    },
    scales: {
      title: '7. Scales — virtual currency',
      body: (
        <>
          <p>
            “Scales” (Écailles) are a unit of account purely internal to the service, earned through
            quests and spent in the cosmetics shop. On this point the rules are strict and admit no
            exception:
          </p>
          <List>
            <li>Scales <strong>have no monetary value</strong> and constitute neither electronic
              money nor a means of payment;</li>
            <li>they <strong>are neither convertible into nor exchangeable for real money</strong>,
              nor for any goods or services outside Wyrm Forge;</li>
            <li>they <strong>are not refundable</strong>, under any circumstances;</li>
            <li>they cannot be transferred, sold or assigned to another user;</li>
            <li>they confer no ownership right: they are a licence to use, limited to the
              service;</li>
            <li>they may be adjusted, suspended or cancelled in the event of fraud, abuse or a
              technical anomaly;</li>
            <li>the earning rates, the shop prices and the daily caps may change at any time;</li>
            <li>the balance and the associated cosmetics are permanently lost when the account is
              closed, whatever the reason.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Scales cannot be bought with real money. Were that possibility ever introduced, these
            terms would be updated beforehand.
          </p>
        </>
      ),
    },
    subscriptions: {
      title: '8. Paid subscriptions',
      body: (
        <>
          <p>
            In addition to the free plan, Wyrm Forge offers paid subscriptions, billed monthly or
            annually. Their full conditions of sale — ordering, right of withdrawal, statutory
            guarantees, complaints — are set out in our{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>terms of sale</Link>, which
            prevail over this article for everything concerning the sale.
          </p>

          <p style={{ marginTop: 16 }}><strong>Tiers and prices</strong></p>
          <SubscriptionOffer />

          <p style={{ marginTop: 16 }}><strong>Payment and renewal</strong></p>
          <PaymentTerms />

          <p style={{ marginTop: 16 }}><strong>Term and cancellation</strong></p>
          <CancellationTerms />

          <p style={{ marginTop: 16 }}><strong>In the event of non-payment</strong></p>
          <UnpaidPolicy />

          <p style={{ marginTop: 16 }}><strong>Right of withdrawal</strong></p>
          <p>
            You have a withdrawal period of 14 days from your subscription (article L221-18 of the
            French Consumer Code). Before payment, we ask you to confirm expressly that you wish to
            access the service immediately: if you then withdraw within that period, you are
            refunded, less the amount corresponding to the service supplied up to your withdrawal.
            The procedure and the withdrawal form are set out in our{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>terms of sale</Link>.
          </p>
        </>
      ),
    },
    availability: {
      title: '9. Availability and liability',
      body: (
        <>
          <p>
            Wyrm Forge depends on third-party services, in particular the Riot Games API. An
            unavailability, a change or a limitation imposed by those services may degrade or
            interrupt all or part of the features. <strong>The free service is provided “as
            is”</strong>, with no guarantee of availability.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>For a paid subscription</strong>, that statement limits neither the statutory
            guarantees of conformity (articles L224-25-1 et seq. of the French Consumer Code) nor
            your right to compensation where the law grants it to you. An interruption caused by an
            event of force majeure, or by the decision of a third party outside our control that we
            could not prevent, does not in itself constitute a failure on our part; if it lastingly
            deprives you of the essential characteristics of your tier, you may cancel free of
            charge and obtain a refund of the unused part of the period paid for.
          </p>
          <p style={{ marginTop: 10 }}>
            The analyses, statistics and recommendations provided — including those generated by AI
            — are indicative: we guarantee no in-game result.
          </p>
          <p style={{ marginTop: 10 }}>
            Save in the event of gross negligence or wilful misconduct on our part, we are not
            liable for indirect damage, for loss of data resulting from a non-compliant use, nor for
            the consequences of a sanction imposed by Riot Games on a game account through the act
            of its holder.
          </p>
        </>
      ),
    },
    termination: {
      title: '10. Termination',
      body: (
        <>
          <p><strong>Cancelling a paid subscription</strong> — see article 8, “Term and
            cancellation”: from your profile page, in a few clicks, effective at the end of the
            period already paid for.</p>
          <p style={{ marginTop: 10 }}>
            <strong>Refund</strong> — cancelling a subscription gives rise to
            <strong> no partial refund</strong>: it takes effect at the end of the period already
            paid for, during which you keep access to your tier. That rule does not stand in the way
            of the refunds provided for by law, which remain due under the conditions described in
            our{' '}
            <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>terms of sale</Link>: exercise
            of the right of withdrawal within 14 days, lack of conformity of the service, or absence
            of prior information before the renewal of an annual subscription.
          </p>
          <p style={{ marginTop: 10 }}><strong>Closing your account</strong> — you may close your
            account at any time from your profile page. The request is processed within 30 days and
            entails the deletion of your profile, your content, your public contributions and your
            Scale balance. You may cancel your request for as long as it has not been
            processed.</p>
          <p style={{ marginTop: 10 }}>
            If a paid subscription is running, your closure request cancels it immediately for the
            future: <strong>no further charge is made</strong>, and you keep the access already paid
            for until the end of the current period, or until the account is actually deleted if
            that happens sooner. The period already paid for is not refunded; you may however
            exercise your right of withdrawal if it is still open (see the terms of sale). If you
            cancel your closure request, the subscription remains cancelled at its expiry date: you
            may reactivate it from the billing portal before that date.
          </p>
          <p style={{ marginTop: 10 }}>
            <strong>On our initiative</strong> — we may suspend or close an account in the event of
            a breach of these terms, of fraud, of abuse or of unlawful activity. Save in an
            emergency or where a legal obligation applies, prior notice is sent to the email address
            associated with the account. If we close a paid account for a reason that is not
            attributable to you, the unused part of the period paid for is refunded to you.
          </p>
          <p style={{ marginTop: 10 }}>
            In every case, closure entails the permanent loss of Scales and of the associated
            cosmetics, without consideration.
          </p>
        </>
      ),
    },
    riotDisclaimer: {
      title: '11. No affiliation with Riot Games',
      body: (
        <>
          <p>
            Wyrm Forge is not affiliated with, sponsored by or endorsed by Riot Games, Inc. or any
            of its subsidiaries. League of Legends and Riot Games are trade marks or registered
            trade marks of Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
          <p style={{ marginTop: 10 }}>
            Using Wyrm Forge does not exempt you from complying with the Riot Games terms of
            service. Any use of the service for cheating, for automating the game or for
            circumventing the Riot Games rules is prohibited.
          </p>
        </>
      ),
    },
    changes: {
      title: '12. Changes to these terms',
      body: (
        <p>
          These terms may be amended, in particular when the beta ends. The date of the last update
          appears at the top of this page. In the event of a substantial change, account holders are
          informed by email. Continuing to use the service after that information constitutes
          acceptance. Changes to the price or to the content of an ongoing subscription follow the
          specific rules of our{' '}
          <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>terms of sale</Link> (prior
          information and right to cancel free of charge).
        </p>
      ),
    },
    disputes: {
      title: '13. Governing law and disputes',
      body: (
        <>
          <p>
            These terms are governed by French law. In the event of a dispute, an amicable solution
            will be sought first: write to us at{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>.
          </p>
          <p style={{ marginTop: 10 }}>
            In accordance with article L612-1 of the French Consumer Code, every consumer may use a
            consumer mediator (médiateur de la consommation) free of charge:{' '}
            <Todo>appoint a consumer mediator before the paid plans open</Todo>
          </p>
          <p style={{ marginTop: 10 }}>
            Failing an amicable resolution, the dispute will be brought before the competent French
            courts.
          </p>
        </>
      ),
    },
  },
}

export const cguDicts: Record<Lang, CguDict> = {
  fr: cguFr,
  en: cguEn,
}

/**
 * Dictionnaire des CGU dans la langue courante.
 *
 * Un hook PAR DOCUMENT, et pas un `useLegal()` global : chaque page légale est
 * une route distincte, et un hook global ferait entrer les quatre documents dans
 * le bundle de chacune. Même raisonnement que `useDashboard()` vs la vitrine.
 */
export const useCgu = (): CguDict => cguDicts[useLanguage().lang]

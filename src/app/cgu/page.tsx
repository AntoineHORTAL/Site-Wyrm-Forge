import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'
import {
  SubscriptionOffer,
  PaymentTerms,
  CancellationTerms,
  UnpaidPolicy,
} from '@/components/legal/SubscriptionTerms'

export const metadata: Metadata = {
  title: 'Conditions générales d\'utilisation — Wyrm Forge',
  description: 'Règles d\'utilisation de Wyrm Forge : compte, statut bêta, Écailles, abonnements Forgeron et Maître, résiliation et non-affiliation à Riot Games.',
}

export default function CguPage() {
  return (
    <LegalPage
      title="Conditions générales"
      accent="d'utilisation"
      updated="11 septembre 2026"
      current="/cgu"
      intro={<>
        Ces conditions encadrent l&apos;utilisation du site wyrm-forge.com et de l&apos;application
        de bureau Wyrm Forge. En créant un compte ou en utilisant le service, tu les acceptes
        dans leur intégralité. Si tu n&apos;es pas d&apos;accord avec l&apos;une d&apos;elles,
        n&apos;utilise pas le service.
      </>}
    >
      <Section title="1. Objet du service">
        <p>
          Wyrm Forge est un assistant de jeu pour League of Legends. Il propose notamment un
          éditeur de builds d&apos;items, un éditeur de jungle paths, des to-do lists, des
          scénarios de macro, des analyses de match up assistées par IA, la consultation
          d&apos;historiques de parties et de parties en cours, ainsi que des tournois
          communautaires.
        </p>
        <p style={{ marginTop: 10 }}>
          Le service est accessible via le site web et via une application de bureau Windows.
          Les deux partagent le même compte.
        </p>
      </Section>

      <Section title="2. Statut bêta">
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
      </Section>

      <Section title="3. Compte utilisateur">
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
      </Section>

      <Section title="4. Liaison du compte Riot">
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
      </Section>

      <Section title="5. Règles d'utilisation">
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
      </Section>

      <Section title="6. Contenus publiés par les utilisateurs">
        <p>
          Tu restes propriétaire des contenus que tu crées. En les publiant sur les espaces
          communautaires (Workshop, tournois), tu accordes à Wyrm Forge une licence non exclusive
          et gratuite permettant leur affichage au sein du service, pour la durée de leur
          publication.
        </p>
        <p style={{ marginTop: 10 }}>
          Tu es seul responsable des contenus que tu publies. Nous nous réservons le droit de
          retirer sans préavis tout contenu contraire aux présentes conditions ou à la loi.
        </p>
      </Section>

      <Section title="7. Écailles — monnaie virtuelle">
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
      </Section>

      <Section title="8. Abonnements payants">
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
      </Section>

      <Section title="9. Disponibilité et responsabilité">
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
      </Section>

      <Section title="10. Résiliation">
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
      </Section>

      <Section title="11. Non-affiliation à Riot Games">
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
      </Section>

      <Section title="12. Modification des conditions">
        <p>
          Ces conditions peuvent être modifiées, notamment à la sortie de la bêta. La date de
          dernière mise à jour figure en haut de cette page. En cas de modification substantielle,
          les titulaires d&apos;un compte en sont informés par e-mail. La poursuite de
          l&apos;utilisation du service après cette information vaut acceptation. Les évolutions
          de prix ou de contenu d&apos;un abonnement en cours obéissent aux règles propres des{' '}
          <Link href="/cgv" style={{ color: 'var(--gold-pale)' }}>conditions générales de
          vente</Link> (information préalable et droit de résilier sans frais).
        </p>
      </Section>

      <Section title="13. Droit applicable et litiges">
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
      </Section>
    </LegalPage>
  )
}

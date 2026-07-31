import type { Metadata } from 'next'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Conditions générales d\'utilisation — Wyrm Forge',
  description: 'Règles d\'utilisation de Wyrm Forge : compte, statut bêta, Écailles, abonnements, résiliation et non-affiliation à Riot Games.',
}

export default function CguPage() {
  return (
    <LegalPage
      title="Conditions générales"
      accent="d'utilisation"
      updated="31 juillet 2026"
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
          Des formules payantes seront proposées ultérieurement. Une offre gratuite fonctionnelle
          restera disponible en permanence. Les modalités suivantes s&apos;appliqueront dès leur
          activation :
        </p>
        <List>
          <li>les prix sont indiqués en euros toutes taxes comprises ;</li>
          <li>les paiements sont traités par Stripe ; aucune donnée de carte bancaire n&apos;est
            stockée par Wyrm Forge ;</li>
          <li>l&apos;abonnement est reconduit automatiquement, sauf résiliation avant
            l&apos;échéance ;</li>
          <li>conformément à l&apos;article L221-18 du Code de la consommation, tu disposes d&apos;un
            délai de rétractation de 14 jours. En demandant l&apos;accès immédiat au service, tu
            acceptes de commencer à en bénéficier avant la fin de ce délai et renonces à ton droit
            de rétractation une fois la prestation pleinement exécutée ;</li>
          <li>modalités détaillées de facturation, de résiliation et de remboursement :{' '}
            <Todo>à préciser à l&apos;activation des abonnements</Todo></li>
        </List>
      </Section>

      <Section title="9. Disponibilité et responsabilité">
        <p>
          Wyrm Forge dépend de services tiers, en particulier de l&apos;API de Riot Games. Une
          indisponibilité, un changement ou une limitation imposée par ces services peut dégrader
          ou interrompre tout ou partie des fonctionnalités, sans que notre responsabilité puisse
          être engagée.
        </p>
        <p style={{ marginTop: 10 }}>
          Les analyses, statistiques et recommandations fournies — y compris celles générées par
          IA — sont indicatives. Elles ne garantissent aucun résultat en jeu et ne sauraient
          engager notre responsabilité.
        </p>
        <p style={{ marginTop: 10 }}>
          Nous ne pouvons être tenus responsables des dommages indirects, de la perte de données
          résultant d&apos;une utilisation non conforme, ni des conséquences d&apos;une sanction
          prononcée par Riot Games à l&apos;encontre d&apos;un compte de jeu.
        </p>
      </Section>

      <Section title="10. Résiliation">
        <p><strong>À ton initiative</strong> — tu peux fermer ton compte à tout moment depuis ta
          page profil. La demande est traitée sous 30 jours et entraîne la suppression de ton
          profil, de tes contenus, de tes contributions publiques et de ton solde d&apos;Écailles.
          Tu peux annuler ta demande tant qu&apos;elle n&apos;a pas été traitée.</p>
        <p style={{ marginTop: 10 }}>
          <strong>À notre initiative</strong> — nous pouvons suspendre ou fermer un compte en cas
          de manquement aux présentes conditions, de fraude, d&apos;abus ou d&apos;activité
          illicite. Sauf urgence ou obligation légale, une notification préalable est envoyée à
          l&apos;adresse e-mail associée au compte.
        </p>
        <p style={{ marginTop: 10 }}>
          Dans tous les cas, la fermeture entraîne la perte définitive des Écailles et des
          cosmétiques associés, sans contrepartie. En cas d&apos;abonnement payant en cours,
          le remboursement éventuel du prorata non consommé s&apos;effectue dans les conditions
          prévues par la loi.
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
          Ces conditions peuvent être modifiées, notamment à la sortie de la bêta ou lors de
          l&apos;activation des abonnements payants. La date de dernière mise à jour figure en
          haut de cette page. En cas de modification substantielle, les titulaires d&apos;un compte
          en sont informés par e-mail. La poursuite de l&apos;utilisation du service après cette
          information vaut acceptation.
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

import type { Metadata } from 'next'
// `Todo` n'est plus importé : cette page n'a plus aucune information manquante.
// Les trous restants du dossier légal vivent tous dans /mentions-legales.
import { LegalPage, Section, List } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Wyrm Forge',
  description: 'Quelles données Wyrm Forge collecte, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer tes droits RGPD.',
}

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de"
      accent="confidentialité"
      updated="11 septembre 2026"
      current="/confidentialite"
      intro={<>
        Wyrm Forge est un assistant de jeu pour League of Legends. Pour fonctionner, il traite
        un petit nombre de données personnelles : celles de ton compte, celles de ton compte Riot
        si tu choisis de le lier, et les données de jeu que l&apos;API de Riot Games nous renvoie.
        Cette page décrit précisément lesquelles, pourquoi, et ce que tu peux exiger à leur sujet.
      </>}
    >
      <Section title="1. Responsable du traitement">
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
      </Section>

      <Section title="2. Données que nous collectons">
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
            vente.</li>
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
      </Section>

      <Section title="3. Cookies et stockage local">
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
      </Section>

      <Section title="4. Pourquoi nous traitons ces données">
        <List>
          <li><strong>Exécution du contrat</strong> — créer et gérer ton compte, fournir les outils
            du service, gérer un éventuel abonnement.</li>
          <li><strong>Consentement</strong> — liaison de ton compte Riot. Retirable à tout
            moment, sans justification.</li>
          <li><strong>Intérêt légitime</strong> — sécurité du service, prévention des abus,
            respect des quotas imposés par Riot Games, amélioration des fonctionnalités.</li>
          <li><strong>Obligation légale</strong> — conservation des pièces comptables des
            abonnements payants, et de la preuve de ta demande d&apos;accès immédiat au service
            (article L221-25 du Code de la consommation), que nous devons pouvoir produire en
            cas de rétractation ou de litige.</li>
        </List>
      </Section>

      <Section title="5. Avec qui ces données sont partagées">
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
          <li><strong>Les autres prestataires</strong> — Vercel, Stripe et Anthropic sont
            établis aux États-Unis. Les transferts correspondants s&apos;appuient sur les clauses
            contractuelles types de la Commission européenne et, pour ceux qui y sont certifiés,
            sur le cadre de protection des données UE–États-Unis (Data Privacy Framework).</li>
        </List>
        {/* À COMPLÉTER PAR HORTAL — vérifier et consigner, prestataire par prestataire :
            (1) que le DPA de Supabase est bien signé et quelle version des CCT il intègre ;
            (2) lesquels de Vercel / Stripe / Anthropic sont effectivement certifiés
            au Data Privacy Framework (la liste officielle est publique et évolue) ;
            (3) l'existence d'une analyse de transfert pour Singapour, qui n'est couvert par
            AUCUNE décision d'adéquation. Tant que ce n'est pas fait, le paragraphe ci-dessus
            décrit l'intention, pas une conformité vérifiée. */}
        <p style={{ marginTop: 12 }}>
          Tu peux nous demander une copie des garanties encadrant ces transferts en écrivant à{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com
          </a>.
        </p>
      </Section>

      <Section title="6. Combien de temps nous les conservons">
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
          <li><strong>Riot ID recherchés (autocomplétion)</strong> — conservés sans limite de durée.
            Il s&apos;agit d&apos;identifiants de jeu publics, non rattachés à un compte Wyrm Forge.</li>
        </List>
      </Section>

      <Section title="7. Tes droits">
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
      </Section>

      <Section title="8. Sécurité">
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
      </Section>

      <Section title="9. Mineurs">
        <p>
          Le service n&apos;est pas destiné aux enfants de moins de 15 ans. Si tu as entre 15 et
          18 ans, nous te recommandons d&apos;utiliser Wyrm Forge avec l&apos;accord de tes parents
          ou de ton représentant légal. Si nous apprenons qu&apos;un compte a été créé par un enfant
          de moins de 15 ans sans autorisation parentale, nous le supprimerons.
        </p>
      </Section>

      <Section title="10. Modifications">
        <p>
          Cette politique peut évoluer, notamment à mesure que le service sort de sa phase de bêta
          et que de nouvelles fonctionnalités apparaissent. La date de dernière mise à jour figure
          en haut de cette page. En cas de modification substantielle, les utilisateurs disposant
          d&apos;un compte en seront informés par e-mail.
        </p>
      </Section>
    </LegalPage>
  )
}

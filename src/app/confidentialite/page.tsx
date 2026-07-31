import type { Metadata } from 'next'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Wyrm Forge',
  description: 'Quelles données Wyrm Forge collecte, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer tes droits RGPD.',
}

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de"
      accent="confidentialité"
      updated="31 juillet 2026"
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
          Le responsable du traitement est <Todo>dénomination sociale de la SASU</Todo>,
          société en cours d&apos;immatriculation, dont le siège est situé <Todo>adresse du siège</Todo>.
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
          <li>contributions publiées sur le Workshop, visibles par les autres utilisateurs ;</li>
          <li>inscriptions à des tournois : nom d&apos;équipe, pseudo Riot et pseudo Discord.
            Le pseudo Discord n&apos;est jamais affiché publiquement, il n&apos;est visible que
            de l&apos;organisation du tournoi.</li>
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

        <p style={{ marginTop: 16 }}>
          <strong>Suivi « prac » (outil interne)</strong> — un administrateur peut demander à suivre
          tes performances dans le temps. Cette demande t&apos;est notifiée par e-mail et
          <strong> rien n&apos;est enregistré tant que tu n&apos;as pas explicitement accepté</strong>.
          Tu peux révoquer ce consentement à tout moment ; les données suivies sont alors
          immédiatement supprimées.
        </p>
      </Section>

      <Section title="3. Cookies et stockage local">
        <p>
          Wyrm Forge n&apos;utilise <strong>que des cookies strictement nécessaires</strong> à son
          fonctionnement. Il n&apos;y a ni cookie publicitaire, ni traceur tiers, ni outil de mesure
          d&apos;audience — c&apos;est pourquoi aucun bandeau de consentement ne t&apos;est présenté.
        </p>
        <List>
          <li><code>sb-…-auth-token</code> — cookie de session émis par Supabase Auth. Il te
            maintient connecté d&apos;une page à l&apos;autre. Attributs <code>SameSite=Lax</code>
            et <code>Secure</code> en production. Sans lui, la connexion est impossible.</li>
        </List>
        <p style={{ marginTop: 12 }}>
          Certaines données restent <strong>uniquement sur ton appareil</strong>, dans le stockage
          local du navigateur, et ne nous sont jamais transmises : tes scénarios de Match Up
          (<code>wf.matchups.v2</code>) et quelques préférences d&apos;affichage. Vider les données
          de ton navigateur les efface définitivement.
        </p>
      </Section>

      <Section title="4. Pourquoi nous traitons ces données">
        <List>
          <li><strong>Exécution du contrat</strong> — créer et gérer ton compte, fournir les outils
            du service, gérer un éventuel abonnement.</li>
          <li><strong>Consentement</strong> — liaison de ton compte Riot, suivi « prac ».
            Retirable à tout moment, sans justification.</li>
          <li><strong>Intérêt légitime</strong> — sécurité du service, prévention des abus,
            respect des quotas imposés par Riot Games, amélioration des fonctionnalités.</li>
          <li><strong>Obligation légale</strong> — conservation des pièces comptables une fois
            les abonnements payants activés.</li>
        </List>
      </Section>

      <Section title="5. Avec qui ces données sont partagées">
        <p>
          Nous ne vendons ni ne louons aucune donnée, et n&apos;en transmettons aucune à des fins
          publicitaires. Nous faisons appel aux prestataires techniques suivants, chacun
          strictement pour la finalité indiquée :
        </p>
        <List>
          <li><strong>Supabase</strong> — hébergement de la base de données et gestion de
            l&apos;authentification. C&apos;est là que résident ton compte et tes contenus.</li>
          <li><strong>Vercel</strong> — hébergement et diffusion du site web.</li>
          <li><strong>Riot Games</strong> — l&apos;API officielle de League of Legends. Nos serveurs
            lui transmettent ton Riot ID ou ton PUUID pour récupérer tes données de jeu.
            Ces échanges sont régis par la politique de confidentialité de Riot Games.</li>
          <li><strong>Anthropic</strong> — génération des analyses IA (Match Up, résumés de patch
            notes). Seul le contexte de la simulation est envoyé (champions, niveaux, objets) ;
            aucun identifiant de compte, aucune adresse e-mail.</li>
          <li><strong>Resend</strong> — envoi des e-mails transactionnels (confirmation de compte,
            notification de demande de suivi).</li>
          <li><strong>Stripe</strong> — traitement des paiements, dès l&apos;activation des
            abonnements payants. Nous ne stockons aucune donnée de carte bancaire :
            elles sont saisies directement chez Stripe.</li>
        </List>
        <p style={{ marginTop: 12 }}>
          Certains de ces prestataires sont établis hors de l&apos;Union européenne. Les transferts
          correspondants s&apos;appuient sur les clauses contractuelles types de la Commission
          européenne. <Todo>confirmer la région d&apos;hébergement Supabase et les garanties de transfert</Todo>
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
          <li><strong>Riot ID recherchés (autocomplétion)</strong> — conservés sans limite de durée.
            Il s&apos;agit d&apos;identifiants de jeu publics, non rattachés à un compte Wyrm Forge.</li>
          <li><strong>Données de suivi « prac »</strong> — supprimées immédiatement en cas de
            révocation du consentement ou de retrait du roster.</li>
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
          <li><strong>Retrait du consentement</strong> — délier ton compte Riot depuis ton profil,
            ou refuser/révoquer un suivi « prac » depuis la page de consentement.</li>
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

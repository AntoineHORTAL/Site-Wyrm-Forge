import type { Metadata } from 'next'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Mentions légales — Wyrm Forge',
  description: 'Éditeur, hébergeur, propriété intellectuelle et contact du site Wyrm Forge.',
}

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions"
      accent="légales"
      updated="31 juillet 2026"
      current="/mentions-legales"
      intro={<>
        Informations légales relatives au site wyrm-forge.com et à l&apos;application de bureau
        Wyrm Forge, conformément à l&apos;article 6 de la loi n° 2004-575 du 21 juin 2004 pour la
        confiance dans l&apos;économie numérique.
      </>}
    >
      <Section title="1. Éditeur du site">
        <p>
          Wyrm Forge est édité par une société par actions simplifiée unipersonnelle (SASU)
          <strong> en cours de constitution</strong>. Les mentions définitives seront publiées ici
          dès son immatriculation au registre du commerce et des sociétés.
        </p>
        <List>
          <li>Dénomination sociale : <Todo>raison sociale</Todo></li>
          <li>Forme juridique : SASU (société par actions simplifiée unipersonnelle)</li>
          <li>Capital social : <Todo>montant du capital</Todo></li>
          <li>Siège social : <Todo>adresse complète du siège</Todo></li>
          <li>SIREN / SIRET : <Todo>numéros SIREN et SIRET</Todo></li>
          <li>RCS : <Todo>ville d&apos;immatriculation et numéro RCS</Todo></li>
          <li>Numéro de TVA intracommunautaire : <Todo>numéro de TVA</Todo></li>
          <li>Directeur de la publication : <Todo>nom du président de la SASU</Todo></li>
        </List>
        <p style={{ marginTop: 12 }}>
          Contact :{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com
          </a>
        </p>
      </Section>

      <Section title="2. Hébergement">
        <p><strong>Hébergeur du site web</strong></p>
        <List>
          <li>Vercel Inc.</li>
          <li>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</li>
          <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--gold-pale)' }}>vercel.com</a></li>
        </List>

        <p style={{ marginTop: 16 }}><strong>Hébergeur de la base de données et de
          l&apos;authentification</strong></p>
        <List>
          <li>Supabase, Inc.</li>
          <li>Adresse postale : <Todo>adresse à confirmer auprès de Supabase</Todo></li>
          <li><a href="https://supabase.com" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--gold-pale)' }}>supabase.com</a></li>
        </List>
        <p style={{ marginTop: 12 }}>
          Le détail des données hébergées et des durées de conservation figure dans notre{' '}
          politique de confidentialité.
        </p>
      </Section>

      <Section title="3. Propriété intellectuelle">
        <p>
          La structure du site, son code source, son identité visuelle, ses textes et la marque
          « Wyrm Forge » sont la propriété exclusive de l&apos;éditeur. Toute reproduction,
          représentation ou exploitation, totale ou partielle, sans autorisation écrite préalable
          est interdite.
        </p>
        <p style={{ marginTop: 10 }}>
          Les contenus publiés par les utilisateurs (builds, jungle paths, scénarios, contributions
          au Workshop) restent la propriété de leurs auteurs. En les publiant sur les espaces
          communautaires, l&apos;auteur concède à Wyrm Forge une licence non exclusive et gratuite
          de reproduction et de représentation, limitée à leur affichage au sein du service, pour
          la durée de leur publication.
        </p>
      </Section>

      <Section title="4. League of Legends et Riot Games">
        <p>
          Wyrm Forge n&apos;est pas affilié, sponsorisé ni approuvé par Riot Games, Inc. ou
          l&apos;une de ses filiales. League of Legends et Riot Games sont des marques ou marques
          déposées de Riot Games, Inc. League of Legends © Riot Games, Inc.
        </p>
        <p style={{ marginTop: 10 }}>
          Les données de jeu, noms de champions, illustrations et icônes proviennent de l&apos;API
          publique et de Data Dragon de Riot Games, et restent la propriété de Riot Games, Inc.
          Wyrm Forge les exploite dans le cadre du Riot Games API Developer Agreement.
        </p>
      </Section>

      <Section title="5. Signalement d'un contenu">
        <p>
          Pour signaler un contenu illicite, une atteinte à un droit de propriété intellectuelle ou
          tout autre manquement, écris à{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com
          </a>{' '}
          en précisant l&apos;URL concernée et la nature du problème. Nous traitons ces signalements
          dans les meilleurs délais.
        </p>
      </Section>

      <Section title="6. Droit applicable">
        <p>
          Le présent site est soumis au droit français. Les conditions d&apos;utilisation du service
          et les règles de règlement des litiges sont détaillées dans nos conditions générales
          d&apos;utilisation.
        </p>
      </Section>
    </LegalPage>
  )
}

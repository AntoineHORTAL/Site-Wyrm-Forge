import type { Metadata } from 'next'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Mentions légales — Wyrm Forge',
  description: 'Éditeur, hébergeur, propriété intellectuelle, médiation et contact du site Wyrm Forge.',
}

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions"
      accent="légales"
      updated="11 septembre 2026"
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
          de droit français.
        </p>
        <List>
          <li>Dénomination sociale : Wyrm Forge</li>
          <li>Forme juridique : SASU (société par actions simplifiée unipersonnelle)</li>
          <li>Capital social : 500 €</li>
          <li>Siège social : 5 Rue du 23 Janvier, 21000 Dijon, France</li>
          <li>SIREN : 109 122 150</li>
          <li>SIRET (siège) : 109 122 150 00013</li>
          <li>RCS : RCS Dijon 109 122 150</li>
          {/* À COMPLÉTER PAR HORTAL — question à trancher AVEC LE COMPTABLE (Dougs), et une
              seule des deux réponses est correcte :
                • assujetti à la TVA  → porter ici le numéro de TVA intracommunautaire ;
                • franchise en base   → remplacer TOUTE la ligne par « TVA non applicable,
                  art. 293 B du CGI », ET retirer « toutes taxes comprises » des CGU § 8,
                  qui laisserait alors croire à tort qu'une TVA est facturée sur les
                  abonnements.
              Ne pas trancher au jugé : les deux mentions sont obligatoires et exclusives. */}
          <li>Numéro de TVA intracommunautaire : <Todo>régime de TVA à trancher avec le
            comptable (Dougs) : numéro intracommunautaire, ou mention de franchise en base
            (art. 293 B du CGI)</Todo></li>
          <li>Directeur de la publication : le président de la SASU
            {' '}<Todo>nom du président, s&apos;il doit être affiché nommément</Todo></li>
        </List>
      </Section>

      <Section title="2. Nous contacter">
        {/* Adresse de contact TRANCHÉE le 2026-09-11 : contact@wyrm-forge.com, confirmée
            active (Google Workspace, transfert configuré). C'est la seule adresse publiée,
            sur les trois pages légales comme dans le bandeau partagé. Ne pas réintroduire
            admin@wyrm-forge.com dans une surface publique : deux adresses de contact, c'est
            une obligation LCEN à moitié tenue et un utilisateur qui écrit dans le vide. */}
        <List>
          <li>Adresse postale : 5 Rue du 23 Janvier, 21000 Dijon, France</li>
          <li>E-mail :{' '}
            <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
              contact@wyrm-forge.com
            </a>
          </li>
          <li>Téléphone : <a href="tel:+33783289106" style={{ color: 'var(--gold-pale)' }}>
            07 83 28 91 06</a></li>
        </List>
        <p style={{ marginTop: 12 }}>
          Ces coordonnées permettent d&apos;entrer en contact directement et efficacement avec
          l&apos;éditeur, conformément à l&apos;article L221-5 du Code de la consommation.
        </p>
      </Section>

      <Section title="3. Hébergement">
        <p><strong>Hébergeur du site web</strong></p>
        <List>
          <li>Vercel Inc.</li>
          <li>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</li>
          <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--gold-pale)' }}>vercel.com</a></li>
        </List>

        <p style={{ marginTop: 16 }}><strong>Hébergeur de la base de données, de
          l&apos;authentification et des fichiers</strong></p>
        <List>
          <li>Supabase, Inc.</li>
          <li>65 Chulia Street, #38-02/03, OCBC Centre, Singapour 049513</li>
          <li>Région d&apos;hébergement du projet : <strong>Irlande (Union européenne)</strong>
            — les données sont stockées et traitées sur des serveurs situés dans l&apos;UE</li>
          <li><a href="https://supabase.com" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--gold-pale)' }}>supabase.com</a></li>
        </List>
        {/* À COMPLÉTER PAR HORTAL — si Cloudflare proxifie réellement le trafic (et ne sert
            pas seulement de registrar / DNS), l'ajouter ici comme hébergeur, et l'ajouter
            aussi à la liste des sous-traitants de la politique de confidentialité § 5
            (avec le cookie __cf_bm au § 3). Ne rien écrire tant que ce n'est pas confirmé. */}
        <p style={{ marginTop: 12 }}>
          Le détail des données hébergées, des sous-traitants et des durées de conservation
          figure dans notre politique de confidentialité.
        </p>
      </Section>

      <Section title="4. Propriété intellectuelle">
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

      <Section title="5. League of Legends et Riot Games">
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

      <Section title="6. Signalement d'un contenu">
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

      <Section title="7. Médiation de la consommation">
        <p>
          Conformément aux articles L616-1 et R616-1 du Code de la consommation, tout consommateur
          a le droit de recourir gratuitement à un médiateur de la consommation en vue de la
          résolution amiable d&apos;un litige qui l&apos;oppose à un professionnel. Wyrm Forge
          relève du médiateur suivant :
        </p>
        {/* À COMPLÉTER PAR HORTAL — désigner un médiateur de la consommation AGRÉÉ par la
            Commission d'évaluation et de contrôle de la médiation de la consommation (CECMC)
            et souscrire l'adhésion correspondante. L'obligation est effective depuis
            l'ouverture des offres payantes. Reporter ensuite le nom, l'adresse postale et
            l'URL de saisine ici ET dans les CGU § 13. */}
        <List>
          <li>Médiateur : <Todo>nom du médiateur agréé</Todo></li>
          <li>Adresse postale : <Todo>adresse du médiateur</Todo></li>
          <li>Saisine en ligne : <Todo>URL de saisine du médiateur</Todo></li>
        </List>
        <p style={{ marginTop: 12 }}>
          Le recours au médiateur suppose d&apos;avoir tenté au préalable de résoudre le litige
          directement auprès de nous par une réclamation écrite.
        </p>
      </Section>

      <Section title="8. Droit applicable">
        <p>
          Le présent site est soumis au droit français. Les conditions d&apos;utilisation du service
          et les règles de règlement des litiges sont détaillées dans nos conditions générales
          d&apos;utilisation.
        </p>
      </Section>
    </LegalPage>
  )
}

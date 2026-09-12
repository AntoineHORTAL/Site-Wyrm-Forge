'use client'

import { List, Todo } from '@/components/legal/LegalBlocks'
import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

/**
 * Mentions légales — texte FR et EN.
 *
 * ⚠️ Conventions de traduction du dossier légal (les quatre documents) :
 *  • les DÉNOMINATIONS JURIDIQUES FRANÇAISES sans équivalent anglais exact
 *    (SASU, RCS, SIREN/SIRET, « directeur de la publication », franchise en base
 *    de TVA) sont conservées en français et GLOSÉES entre parenthèses. Traduire
 *    « SASU » par « limited company » désignerait une autre forme sociale : le
 *    lecteur anglophone doit pouvoir retrouver l'entité dans les registres ;
 *  • les RÉFÉRENCES D'ARTICLES restent françaises (« article L221-18 du Code de
 *    la consommation ») : elles désignent un texte qui n'existe qu'en français,
 *    et c'est ce numéro qui permet de le retrouver ;
 *  • les TROUS `<Todo>` sont portés par LES DEUX langues. Une version anglaise
 *    qui paraîtrait complète alors que le français signale une information
 *    manquante donnerait une fausse impression de complétude.
 */

export const mentionsFr = {
  title: 'Mentions',
  accent: 'légales',
  /** ISO — formatée dans la langue lue par `LegalPage`. */
  updated: '2026-09-11',
  intro: (
    <>
      Informations légales relatives au site wyrm-forge.com et à l&apos;application de bureau
      Wyrm Forge, conformément à l&apos;article 6 de la loi n° 2004-575 du 21 juin 2004 pour la
      confiance dans l&apos;économie numérique.
    </>
  ),
  sections: {
    editor: {
      title: '1. Éditeur du site',
      body: (
        <>
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
                Ne pas trancher au jugé : les deux mentions sont obligatoires et exclusives.
                ⚠️ La réponse doit être reportée DANS LES DEUX LANGUES, ici et dans les CGV § 1. */}
            <li>Numéro de TVA intracommunautaire : <Todo>régime de TVA à trancher avec le
              comptable (Dougs) : numéro intracommunautaire, ou mention de franchise en base
              (art. 293 B du CGI)</Todo></li>
            {/* Nom CONFIRMÉ par HORTAL le 2026-09-12. L'art. 6 III 1° a) de la LCEN exige
                le nom du directeur de la publication pour un service édité à titre
                professionnel : ce n'était donc pas « s'il doit être affiché », c'était dû. */}
            <li>Directeur de la publication : Antoine HORTAL, président de la SASU</li>
          </List>
        </>
      ),
    },
    contact: {
      title: '2. Nous contacter',
      body: (
        <>
          {/* Adresse de contact TRANCHÉE le 2026-09-11 : contact@wyrm-forge.com, confirmée
              active (Google Workspace, transfert configuré). C'est la seule adresse publiée,
              sur les quatre pages légales comme dans le bandeau partagé. Ne pas réintroduire
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
        </>
      ),
    },
    hosting: {
      title: '3. Hébergement',
      body: (
        <>
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

          <p style={{ marginTop: 16 }}><strong>Diffusion et protection du trafic</strong></p>
          <List>
            <li>Cloudflare, Inc.</li>
            <li>101 Townsend St, San Francisco, CA 94107, États-Unis</li>
            <li>L&apos;ensemble du trafic du site transite par le réseau de Cloudflare avant
              d&apos;atteindre l&apos;hébergement : il assure la diffusion des contenus (réseau de
              serveurs périphériques, dont plusieurs dans l&apos;Union européenne) et la protection
              contre les attaques par déni de service et les robots</li>
            <li><a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>cloudflare.com</a></li>
          </List>
          {/* ✅ CONFIRMÉ le 2026-09-12 : Cloudflare est en mode PROXY (nuage orange), pas
              seulement registrar/DNS — vérifié sur les en-têtes de réponse de la prod
              (`Server: cloudflare`, `CF-RAY`). Il est donc déclaré ici comme intermédiaire
              technique, et au § 5 de la politique de confidentialité comme sous-traitant. */}
          <p style={{ marginTop: 12 }}>
            Le détail des données hébergées, des sous-traitants et des durées de conservation
            figure dans notre politique de confidentialité.
          </p>
        </>
      ),
    },
    ip: {
      title: '4. Propriété intellectuelle',
      body: (
        <>
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
        </>
      ),
    },
    riot: {
      title: '5. League of Legends et Riot Games',
      body: (
        <>
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
        </>
      ),
    },
    report: {
      title: '6. Signalement d’un contenu',
      body: (
        <p>
          Pour signaler un contenu illicite, une atteinte à un droit de propriété intellectuelle ou
          tout autre manquement, écris à{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com
          </a>{' '}
          en précisant l&apos;URL concernée et la nature du problème. Nous traitons ces signalements
          dans les meilleurs délais.
        </p>
      ),
    },
    mediation: {
      title: '7. Médiation de la consommation',
      body: (
        <>
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
              l'URL de saisine ici ET dans les CGU § 13 et les CGV § 9 — DANS LES DEUX LANGUES. */}
          <List>
            <li>Médiateur : <Todo>nom du médiateur agréé</Todo></li>
            <li>Adresse postale : <Todo>adresse du médiateur</Todo></li>
            <li>Saisine en ligne : <Todo>URL de saisine du médiateur</Todo></li>
          </List>
          <p style={{ marginTop: 12 }}>
            Le recours au médiateur suppose d&apos;avoir tenté au préalable de résoudre le litige
            directement auprès de nous par une réclamation écrite.
          </p>
        </>
      ),
    },
    law: {
      title: '8. Droit applicable',
      body: (
        <p>
          Le présent site est soumis au droit français. Les conditions d&apos;utilisation du service
          et les règles de règlement des litiges sont détaillées dans nos conditions générales
          d&apos;utilisation.
        </p>
      ),
    },
  },
}

export type MentionsDict = typeof mentionsFr

export const mentionsEn: MentionsDict = {
  title: 'Legal',
  accent: 'notice',
  updated: '2026-09-11',
  intro: (
    <>
      Legal information about the wyrm-forge.com website and the Wyrm Forge desktop application,
      pursuant to article 6 of French Act No. 2004-575 of 21 June 2004 on confidence in the
      digital economy (loi pour la confiance dans l’économie numérique, “LCEN”).
    </>
  ),
  sections: {
    editor: {
      title: '1. Publisher of the website',
      body: (
        <>
          <p>
            Wyrm Forge is published by a <em>société par actions simplifiée unipersonnelle</em>
            {' '}(SASU) incorporated under French law — a simplified joint-stock company with a
            single shareholder. The French form is kept here because it has no exact equivalent
            abroad and is the name under which the company appears in the public registers.
          </p>
          <List>
            <li>Company name: Wyrm Forge</li>
            <li>Legal form: SASU (société par actions simplifiée unipersonnelle)</li>
            <li>Share capital: €500</li>
            <li>Registered office: 5 Rue du 23 Janvier, 21000 Dijon, France</li>
            <li>SIREN (French company identifier): 109 122 150</li>
            <li>SIRET (establishment identifier, registered office): 109 122 150 00013</li>
            <li>RCS (French trade and companies register): RCS Dijon 109 122 150</li>
            <li>Intra-EU VAT number: <Todo>VAT regime still to be settled with the accountant
              (Dougs): either an intra-EU VAT number, or the French small-business exemption
              wording “TVA non applicable, art. 293 B du CGI”</Todo></li>
            <li>Publication director (directeur de la publication): Antoine HORTAL, chairman
              of the SASU</li>
          </List>
        </>
      ),
    },
    contact: {
      title: '2. Contacting us',
      body: (
        <>
          <List>
            <li>Postal address: 5 Rue du 23 Janvier, 21000 Dijon, France</li>
            <li>Email:{' '}
              <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
                contact@wyrm-forge.com
              </a>
            </li>
            <li>Telephone: <a href="tel:+33783289106" style={{ color: 'var(--gold-pale)' }}>
              +33 7 83 28 91 06</a></li>
          </List>
          <p style={{ marginTop: 12 }}>
            These details allow you to contact the publisher directly and effectively, in
            accordance with article L221-5 of the French Consumer Code.
          </p>
        </>
      ),
    },
    hosting: {
      title: '3. Hosting',
      body: (
        <>
          <p><strong>Website host</strong></p>
          <List>
            <li>Vercel Inc.</li>
            <li>340 S Lemon Ave #4133, Walnut, CA 91789, United States</li>
            <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>vercel.com</a></li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Host of the database, of authentication and of
            files</strong></p>
          <List>
            <li>Supabase, Inc.</li>
            <li>65 Chulia Street, #38-02/03, OCBC Centre, Singapore 049513</li>
            <li>Hosting region of the project: <strong>Ireland (European Union)</strong> — the
              data is stored and processed on servers located in the EU</li>
            <li><a href="https://supabase.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>supabase.com</a></li>
          </List>

          <p style={{ marginTop: 16 }}><strong>Traffic delivery and protection</strong></p>
          <List>
            <li>Cloudflare, Inc.</li>
            <li>101 Townsend St, San Francisco, CA 94107, United States</li>
            <li>All traffic to the site passes through Cloudflare&apos;s network before reaching
              the hosting provider: it handles content delivery (a network of edge servers,
              several of them in the European Union) and protection against denial-of-service
              attacks and bots</li>
            <li><a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold-pale)' }}>cloudflare.com</a></li>
          </List>

          <p style={{ marginTop: 12 }}>
            The detail of the data hosted, of the processors and of the retention periods is set
            out in our privacy policy.
          </p>
        </>
      ),
    },
    ip: {
      title: '4. Intellectual property',
      body: (
        <>
          <p>
            The structure of the website, its source code, its visual identity, its texts and the
            “Wyrm Forge” trade mark are the exclusive property of the publisher. Any reproduction,
            representation or exploitation, in whole or in part, without prior written
            authorisation is prohibited.
          </p>
          <p style={{ marginTop: 10 }}>
            Content published by users (builds, jungle paths, scenarios, Workshop contributions)
            remains the property of its authors. By publishing it in the community areas, the
            author grants Wyrm Forge a non-exclusive, royalty-free licence to reproduce and
            display it, limited to its display within the service, for the duration of its
            publication.
          </p>
        </>
      ),
    },
    riot: {
      title: '5. League of Legends and Riot Games',
      body: (
        <>
          <p>
            Wyrm Forge is not affiliated with, sponsored by or endorsed by Riot Games, Inc. or any
            of its subsidiaries. League of Legends and Riot Games are trade marks or registered
            trade marks of Riot Games, Inc. League of Legends © Riot Games, Inc.
          </p>
          <p style={{ marginTop: 10 }}>
            Game data, champion names, artwork and icons come from the public Riot Games API and
            from Data Dragon, and remain the property of Riot Games, Inc. Wyrm Forge uses them
            under the Riot Games API Developer Agreement.
          </p>
        </>
      ),
    },
    report: {
      title: '6. Reporting content',
      body: (
        <p>
          To report unlawful content, an infringement of an intellectual property right or any
          other breach, write to{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com
          </a>{' '}
          stating the URL concerned and the nature of the problem. We deal with such reports as
          quickly as possible.
        </p>
      ),
    },
    mediation: {
      title: '7. Consumer mediation',
      body: (
        <>
          <p>
            In accordance with articles L616-1 and R616-1 of the French Consumer Code, every
            consumer is entitled to use a consumer mediator (médiateur de la consommation) free of
            charge with a view to the amicable resolution of a dispute with a trader. Wyrm Forge
            falls under the following mediator:
          </p>
          <List>
            <li>Mediator: <Todo>name of the approved mediator</Todo></li>
            <li>Postal address: <Todo>address of the mediator</Todo></li>
            <li>Online referral: <Todo>URL for referring a dispute to the mediator</Todo></li>
          </List>
          <p style={{ marginTop: 12 }}>
            Referral to the mediator requires that you first attempted to resolve the dispute
            directly with us by means of a written complaint.
          </p>
        </>
      ),
    },
    law: {
      title: '8. Governing law',
      body: (
        <p>
          This website is governed by French law. The conditions for using the service and the
          rules for settling disputes are set out in our terms of use.
        </p>
      ),
    },
  },
}

export const mentionsDicts: Record<Lang, MentionsDict> = {
  fr: mentionsFr,
  en: mentionsEn,
}

/**
 * Dictionnaire des mentions légales dans la langue courante.
 *
 * Un hook PAR DOCUMENT, et pas un `useLegal()` global : chaque page légale est
 * une route distincte, et un hook global ferait entrer les quatre documents dans
 * le bundle de chacune. Même raisonnement que `useDashboard()` vs la vitrine.
 */
export const useMentions = (): MentionsDict => mentionsDicts[useLanguage().lang]

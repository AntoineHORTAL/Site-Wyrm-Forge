'use client'

import Link from 'next/link'
import { List, Todo } from '@/components/legal/LegalBlocks'
import {
  SubscriptionOffer,
  PaymentTerms,
  CancellationTerms,
  UnpaidPolicy,
  PriceChanges,
} from '@/components/legal/SubscriptionTerms'
import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

/**
 * Conditions générales de vente — abonnements Forgeron et Maître, texte FR et EN.
 *
 * Informations précontractuelles de l'art. L221-5 du Code de la consommation.
 * Route dédiée plutôt qu'une section en fin de /cgu : le lien « conditions
 * générales de vente » de la modale de paiement doit mener à un document
 * identifiable en tant que tel, et le site n'a pas de routage i18n par URL
 * (la langue est un état client) — il n'y avait donc aucune structure de
 * routes localisées à respecter.
 *
 * 🔴 POURQUOI LA VERSION ANGLAISE EXISTE — art. 6 du règlement Rome I : le
 * contrat conclu par un consommateur résidant dans un autre État membre reste
 * soumis aux dispositions impératives de SON droit, et il ne peut pas être
 * réputé avoir accepté des conditions qu'il n'était pas en mesure de lire. Un
 * site qui se présente en anglais et ne propose ses conditions de vente qu'en
 * français prend donc le risque que le consentement à ces clauses soit écarté.
 * La traduction n'est pas un confort d'interface : c'est ce qui rend les clauses
 * opposables à l'abonné anglophone.
 *
 * ⚠️ HORS PÉRIMÈTRE : le « Kit sur mesure » (prestation à distance avec
 * acompte/solde, rétractation pleinement applicable, parcours en 8 états) aura
 * ses propres conditions. Ne pas l'ajouter ici.
 *
 * ⚠️ `updated` DOIT correspondre à `CGV_VERSION` (src/lib/stripe/checkout-
 * consent.ts) : c'est la version enregistrée avec chaque preuve de
 * consentement. `checkout-consent.test.ts` relit ce fichier et échoue si les
 * deux divergent. Toute modification de fond de ce document = avancer les deux.
 * La date est stockée au format ISO et FORMATÉE par `LegalPage` dans la langue
 * lue : les deux versions ne peuvent donc pas annoncer deux dates différentes.
 */

const mail = (
  <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
    contact@wyrm-forge.com
  </a>
)

export const cgvFr = {
  title: 'Conditions générales',
  accent: 'de vente',
  updated: '2026-09-11',
  intro: (
    <>
      Ces conditions régissent la vente à distance des abonnements payants Wyrm Forge
      (paliers Forgeron et Maître) à toute personne physique agissant à des fins non
      professionnelles. Elles complètent les{' '}
      <Link href="/cgu" style={{ color: 'var(--gold-pale)' }}>conditions générales
      d&apos;utilisation</Link>, qui régissent l&apos;usage du service lui-même. Tu les acceptes
      au moment de ta souscription ; la version applicable est celle en vigueur à cette date.
    </>
  ),
  sections: {
    seller: {
      title: '1. Le vendeur',
      body: (
        <>
          {/* Identité reprise de `locales/legal/mentions.tsx` (chantier du 2026-09-11).
              Nom du président non affiché, comme dans les mentions légales. */}
          <List>
            <li>Wyrm Forge, société par actions simplifiée unipersonnelle (SASU) au capital de
              500 €</li>
            <li>Siège social : 5 Rue du 23 Janvier, 21000 Dijon, France</li>
            <li>RCS Dijon 109 122 150 — SIRET 109 122 150 00013</li>
            <li>E-mail : {mail} — téléphone :{' '}
              <a href="tel:+33783289106" style={{ color: 'var(--gold-pale)' }}>07 83 28 91 06</a></li>
            <li>Numéro de TVA intracommunautaire :{' '}
              <Todo>régime de TVA à trancher avec le comptable (Dougs)</Todo></li>
          </List>
          <p style={{ marginTop: 10 }}>
            Les mentions complètes figurent dans nos{' '}
            <Link href="/mentions-legales" style={{ color: 'var(--gold-pale)' }}>mentions
            légales</Link>.
          </p>
        </>
      ),
    },
    offers: {
      title: '2. Les offres et leurs caractéristiques essentielles',
      body: (
        <>
          <SubscriptionOffer />
          <p style={{ marginTop: 10 }}>
            Le service est accessible depuis un navigateur web récent et, pour l&apos;application de
            bureau, sous Windows 10 ou 11. Certaines fonctionnalités nécessitent de lier un compte
            Riot Games et dépendent de la disponibilité de l&apos;API de Riot Games.
          </p>
        </>
      ),
    },
    price: {
      title: '3. Prix et paiement',
      body: (
        <>
          <PaymentTerms />
          <div style={{ marginTop: 16 }}>
            <PriceChanges />
          </div>
        </>
      ),
    },
    order: {
      title: '4. Commande',
      body: (
        <>
          <p>La souscription se déroule en ligne, en quatre étapes :</p>
          <List>
            <li>choix du palier et de la périodicité (mensuelle ou annuelle) sur la grille
              tarifaire ;</li>
            <li>connexion à ton compte Wyrm Forge, ou création de ce compte ;</li>
            <li>récapitulatif du palier, du prix et des conditions de renouvellement, et
              confirmation de ta demande d&apos;accès immédiat au service (voir l&apos;article 6) —
              sans cette confirmation, le paiement ne peut pas être lancé ;</li>
            <li>paiement sur la page sécurisée de Stripe, où tu peux saisir un code promotionnel et
              vérifier le montant exact avant de valider.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            Le contrat est conclu à la validation du paiement. Ton palier est activé dans les
            instants qui suivent, sur le site comme dans l&apos;application.
          </p>
          {/* Art. L221-13 — confirmation sur support durable, envoyée par l'EF
              `subscription-emails` (gabarit `order_confirmation`, supabase/functions/
              _shared/subscription-emails.ts), dans les minutes qui suivent le paiement.
              ⚠️ À faire valider par le juriste : l'e-mail reprend les informations
              essentielles et le texte exact de la demande expresse, mais renvoie aux CGV
              par un LIEN — or un lien n'est pas un support durable (CJUE, Content
              Services, C-49/11). Joindre les CGV en PDF serait la forme la plus sûre.
              Cet e-mail est bilingue depuis le 2026-09-12 : sa langue est celle de la
              preuve de consentement de la commande (`checkout_consent_log.locale`) —
              voir AGENTS.md § E-mails transactionnels › Langue des e-mails. */}
          <p style={{ marginTop: 10 }}>
            Une confirmation de ta commande t&apos;est adressée par e-mail dans les minutes qui
            suivent le paiement : elle reprend le palier, le prix, la périodicité, la date du
            premier prélèvement et de la prochaine échéance, ton droit de rétractation et le
            texte exact de ta demande d&apos;accès immédiat, avec un lien vers les présentes
            conditions.
          </p>
        </>
      ),
    },
    term: {
      title: '5. Durée, renouvellement et résiliation',
      body: (
        <>
          <CancellationTerms />

          {/* Obligation Chatel (art. L215-1) — ⚠️ AUCUN ENVOI N'EXISTE à ce jour.
              La seconde phrase n'est pas une clause de style : c'est la sanction
              légale du défaut d'information, et elle s'applique d'office tant que
              l'envoi n'est pas branché. Voir AGENTS.md § CGV / rappel annuel. */}
          <p style={{ marginTop: 16 }}><strong>Abonnement annuel — information avant le
            renouvellement</strong></p>
          <p>
            Pour un abonnement annuel, nous t&apos;informons par écrit, par un e-mail envoyé au plus
            tôt trois mois et au plus tard un mois avant la fin de ta période annuelle, de la date à
            laquelle il sera renouvelé et de la possibilité de ne pas le reconduire (article L215-1
            du Code de la consommation). Si cette information ne t&apos;a pas été adressée dans ces
            délais, tu peux résilier gratuitement ton abonnement à tout moment à compter de la date
            de renouvellement : les sommes versées pour la période postérieure à la résiliation te
            sont alors remboursées dans un délai de trente jours.
          </p>

          <p style={{ marginTop: 16 }}><strong>Impayés</strong></p>
          <UnpaidPolicy />
        </>
      ),
    },
    withdrawal: {
      title: '6. Droit de rétractation',
      body: (
        <>
          <p>
            Tu disposes d&apos;un délai de <strong>14 jours</strong> à compter de la conclusion du
            contrat pour te rétracter, sans avoir à justifier ta décision ni à payer de pénalité
            (articles L221-18 et suivants du Code de la consommation).
          </p>

          <p style={{ marginTop: 16 }}><strong>Accès immédiat au service</strong></p>
          {/* Art. L221-25. Le texte exact de la case, versionné, est dans
              src/lib/stripe/checkout-consent.ts — ce paragraphe en explique la
              portée, il ne le remplace pas. Ce texte existe DÉJÀ en FR et en EN
              (`CONSENT_TEXTS`), et la langue affichée est enregistrée avec la preuve. */}
          <p>
            Un abonnement donne accès au service dès le paiement. Avant de payer, nous te demandons
            donc de confirmer expressément, en cochant une case, que tu souhaites que le service
            commence immédiatement, avant la fin du délai de rétractation. Cette demande ne te fait
            pas perdre ton droit de rétractation : si tu te rétractes dans les 14 jours, tu restes
            redevable du <strong>montant correspondant au service fourni jusqu&apos;à ta
            rétractation</strong>, proportionnel au prix de la période souscrite. Ce montant est
            calculé au jour près : prix de la période × nombre de jours écoulés entre la
            souscription et la réception de ta décision ÷ nombre de jours de la période. Le
            surplus t&apos;est remboursé.
          </p>
          <p style={{ marginTop: 10 }}>
            Exemple : un abonnement annuel à 60 € dont tu te rétractes au bout de 5 jours donne
            lieu à un remboursement de 60 € − (60 € × 5 ÷ 365), soit 59,18 €.
          </p>
          <p style={{ marginTop: 10 }}>
            Conformément à l&apos;article L221-28 du Code de la consommation, le droit de
            rétractation ne peut plus être exercé une fois le service pleinement fourni avant la fin
            du délai, ce que tu reconnais en cochant la case.
          </p>

          <p style={{ marginTop: 16 }}><strong>Comment te rétracter</strong></p>
          <p>
            Informe-nous de ta décision avant l&apos;expiration du délai, par une déclaration
            dénuée d&apos;ambiguïté — un e-mail à {mail} suffit —, ou en nous adressant le
            formulaire ci-dessous (annexe), par e-mail ou par courrier au 5 Rue du 23 Janvier,
            21000 Dijon. Il suffit que ta décision soit envoyée avant la fin du délai.
          </p>

          <p style={{ marginTop: 16 }}><strong>Effets de la rétractation</strong></p>
          {/* Traitement MANUEL à ce jour : annulation immédiate de l'abonnement et
              remboursement partiel depuis le Dashboard Stripe. Aucune automatisation. */}
          <p>
            Ton abonnement est arrêté et ton compte repasse au palier gratuit dès la prise en
            compte de ta rétractation. Nous te remboursons la somme due au plus tard 14 jours
            après avoir été informés de ta décision (article L221-24), en utilisant le moyen de
            paiement employé pour la souscription, sauf accord exprès de ta part pour un autre
            moyen ; ce remboursement ne te coûte aucun frais.
          </p>
        </>
      ),
    },
    guarantees: {
      title: '7. Garanties légales',
      body: (
        <>
          {/* Reproduit d'après le modèle d'information du décret n° 2022-424 du
              25 mars 2022 pour les contenus et services numériques.
              ⚠️ À COMPLÉTER PAR HORTAL — faire vérifier ce texte MOT POUR MOT contre
              Légifrance par le juriste : c'est un encadré réglementaire, sa
              formulation n'est pas libre.
              ⚠️ La version anglaise en est une TRADUCTION de courtoisie : le décret
              n'impose ce libellé qu'en français, et c'est le texte français qui fait
              foi pour le contrôle. Ne pas « améliorer » l'un sans l'autre. */}
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            border: '1px solid rgba(239,159,39,0.35)', background: 'rgba(239,159,39,0.05)',
          }}>
            <p><strong>Garantie légale de conformité — contenus et services numériques</strong></p>
            <p style={{ marginTop: 8 }}>
              Le consommateur dispose d&apos;un délai de deux ans à compter de la fourniture du
              contenu numérique ou du service numérique pour obtenir la mise en œuvre de la garantie
              légale de conformité en cas d&apos;apparition d&apos;un défaut de conformité. Durant
              un délai d&apos;un an à compter de la date de fourniture, le consommateur n&apos;est
              tenu d&apos;établir que l&apos;existence du défaut de conformité et non la date
              d&apos;apparition de celui-ci.
            </p>
            <p style={{ marginTop: 8 }}>
              Lorsque le contrat prévoit la fourniture continue du contenu numérique ou du service
              numérique pendant une durée donnée, la garantie légale s&apos;applique pendant toute
              la durée de fourniture ; durant ce délai, le consommateur n&apos;est tenu
              d&apos;établir que l&apos;existence du défaut de conformité affectant le contenu
              numérique ou le service numérique et non la date d&apos;apparition de celui-ci.
            </p>
            <p style={{ marginTop: 8 }}>
              La garantie légale de conformité emporte obligation pour le professionnel, le cas
              échéant, de fournir toutes les mises à jour nécessaires au maintien de la conformité
              du contenu numérique ou du service numérique.
            </p>
            <p style={{ marginTop: 8 }}>
              La garantie légale de conformité donne au consommateur droit à la mise en conformité
              du contenu numérique ou du service numérique sans retard injustifié suivant sa
              demande, sans frais et sans inconvénient majeur pour lui.
            </p>
            <p style={{ marginTop: 8 }}>
              Le consommateur peut obtenir une réduction du prix en conservant le contenu numérique
              ou le service numérique, ou il peut mettre fin au contrat en se faisant rembourser
              intégralement contre renoncement au contenu numérique ou au service numérique, si :
            </p>
            <List>
              <li>le professionnel refuse de mettre le contenu numérique ou le service numérique en
                conformité ;</li>
              <li>la mise en conformité du contenu numérique ou du service numérique est retardée de
                manière injustifiée ;</li>
              <li>la mise en conformité du contenu numérique ou du service numérique ne peut
                intervenir sans frais imposés au consommateur ;</li>
              <li>la mise en conformité du contenu numérique ou du service numérique occasionne un
                inconvénient majeur pour le consommateur ;</li>
              <li>la non-conformité du contenu numérique ou du service numérique persiste en dépit
                de la tentative de mise en conformité du professionnel restée infructueuse.</li>
            </List>
            <p style={{ marginTop: 8 }}>
              Le consommateur a également droit à une réduction du prix ou à la résolution du
              contrat lorsque le défaut de conformité est si grave qu&apos;il justifie que la
              réduction du prix ou la résolution du contrat soit immédiate. Le consommateur
              n&apos;est alors pas tenu de demander la mise en conformité du contenu numérique ou du
              service numérique au préalable.
            </p>
            <p style={{ marginTop: 8 }}>
              Dans les cas où le défaut de conformité est mineur, le consommateur n&apos;a droit à
              l&apos;annulation du contrat que si le contrat ne prévoit pas le paiement d&apos;un
              prix.
            </p>
            <p style={{ marginTop: 8 }}>
              Toute période d&apos;indisponibilité du contenu numérique ou du service numérique en
              vue de sa remise en conformité suspend la garantie qui restait à courir jusqu&apos;à la
              fourniture du contenu numérique ou du service numérique de nouveau conforme.
            </p>
            <p style={{ marginTop: 8 }}>
              Ces droits résultent de l&apos;application des articles L. 224-25-1 à L. 224-25-31 du
              code de la consommation.
            </p>
            <p style={{ marginTop: 8 }}>
              Le professionnel qui fait obstacle de mauvaise foi à la mise en œuvre de la garantie
              légale de conformité encourt une amende civile d&apos;un montant maximal de
              300 000 euros, qui peut être porté jusqu&apos;à 10 % du chiffre d&apos;affaires moyen
              annuel (article L. 242-18-1 du code de la consommation).
            </p>
            <p style={{ marginTop: 8 }}>
              Le consommateur bénéficie également de la garantie légale des vices cachés en
              application des articles 1641 à 1649 du code civil, pendant une durée de deux ans à
              compter de la découverte du défaut. Cette garantie donne droit à une réduction de
              prix si le contenu numérique ou le service numérique est conservé ou à un
              remboursement intégral contre renonciation au contenu numérique ou au service
              numérique.
            </p>
          </div>
          <p style={{ marginTop: 12 }}>
            Pour mettre en œuvre l&apos;une de ces garanties, écris-nous en suivant la procédure de
            réclamation de l&apos;article 8, en décrivant le défaut constaté.
          </p>
        </>
      ),
    },
    complaints: {
      title: '8. Réclamations',
      body: (
        <p>
          Pour toute réclamation relative à ton abonnement — facturation, accès à ton palier,
          défaut de fonctionnement —, écris-nous à {mail}, ou par courrier au 5 Rue du 23 Janvier,
          21000 Dijon, en indiquant l&apos;adresse e-mail de ton compte et l&apos;objet de ta
          demande. Nous accusons réception de ta réclamation et y répondons dans les meilleurs
          délais, et au plus tard sous 30 jours.
        </p>
      ),
    },
    mediation: {
      title: '9. Médiation de la consommation',
      body: (
        <>
          {/* À COMPLÉTER PAR HORTAL — médiateur non encore choisi. Reporter les mêmes
              informations ici, dans les CGU § 13 et dans les mentions légales § 7,
              DANS LES DEUX LANGUES. */}
          <p>
            Si ta réclamation écrite n&apos;a pas abouti, tu peux recourir gratuitement à un
            médiateur de la consommation en vue d&apos;une résolution amiable (articles L612-1 et
            suivants du Code de la consommation), dans un délai d&apos;un an à compter de ta
            réclamation :
          </p>
          <List>
            <li>Médiateur : <Todo>nom du médiateur agréé</Todo></li>
            <li>Adresse postale : <Todo>adresse du médiateur</Todo></li>
            <li>Saisine en ligne : <Todo>URL de saisine du médiateur</Todo></li>
          </List>
        </>
      ),
    },
    personalData: {
      title: '10. Données personnelles',
      body: (
        <p>
          Les données nécessaires à la gestion de ton abonnement, ainsi que la preuve de ta
          demande d&apos;accès immédiat, sont traitées comme décrit dans notre{' '}
          <Link href="/confidentialite" style={{ color: 'var(--gold-pale)' }}>politique de
          confidentialité</Link>.
        </p>
      ),
    },
    disputes: {
      title: '11. Droit applicable et litiges',
      body: (
        <p>
          Les présentes conditions sont soumises au droit français. À défaut de résolution
          amiable, le litige peut être porté, au choix du consommateur, devant l&apos;une des
          juridictions territorialement compétentes en vertu du Code de procédure civile, ou
          devant la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou
          de la survenance du fait dommageable (article R631-3 du Code de la consommation).
        </p>
      ),
    },
    annex: {
      title: 'Annexe — Formulaire de rétractation',
      body: (
        <>
          {/* Modèle de l'annexe à l'article R221-1 du Code de la consommation,
              complété des coordonnées du vendeur et adapté à une prestation de
              services. La version anglaise reprend la traduction du modèle de
              l'annexe I B de la directive 2011/83/UE, dont l'annexe française
              est la transposition — pas une reformulation libre. */}
          <p>
            <em>(Complète et renvoie le présent formulaire uniquement si tu souhaites te rétracter
            du contrat.)</em>
          </p>
          <div style={{
            marginTop: 10, padding: '14px 16px', borderRadius: 8,
            border: '1px dashed var(--border)', fontSize: 14,
          }}>
            <p>
              À l&apos;attention de Wyrm Forge, 5 Rue du 23 Janvier, 21000 Dijon, France —
              contact@wyrm-forge.com :
            </p>
            <p style={{ marginTop: 8 }}>
              Je vous notifie par la présente ma rétractation du contrat portant sur la prestation
              de services ci-dessous :
            </p>
            <p style={{ marginTop: 8 }}>Abonnement (palier et périodicité) :</p>
            <p style={{ marginTop: 8 }}>Souscrit le :</p>
            <p style={{ marginTop: 8 }}>Nom du consommateur :</p>
            <p style={{ marginTop: 8 }}>Adresse e-mail du compte Wyrm Forge :</p>
            <p style={{ marginTop: 8 }}>Adresse du consommateur :</p>
            <p style={{ marginTop: 8 }}>
              Signature du consommateur (uniquement en cas de notification du présent formulaire sur
              papier) :
            </p>
            <p style={{ marginTop: 8 }}>Date :</p>
          </div>
        </>
      ),
    },
  },
}

export type CgvDict = typeof cgvFr

export const cgvEn: CgvDict = {
  title: 'Terms of',
  accent: 'sale',
  updated: '2026-09-11',
  intro: (
    <>
      These terms govern the distance selling of the paid Wyrm Forge subscriptions (Blacksmith and
      Master tiers) to any natural person acting for purposes outside their trade or profession.
      They supplement our{' '}
      <Link href="/cgu" style={{ color: 'var(--gold-pale)' }}>terms of use</Link>, which govern the
      use of the service itself. You accept them at the moment you subscribe; the applicable
      version is the one in force on that date.
    </>
  ),
  sections: {
    seller: {
      title: '1. The seller',
      body: (
        <>
          <List>
            <li>Wyrm Forge, <em>société par actions simplifiée unipersonnelle</em> (SASU — a French
              simplified joint-stock company with a single shareholder) with share capital of
              €500</li>
            <li>Registered office: 5 Rue du 23 Janvier, 21000 Dijon, France</li>
            <li>RCS Dijon (French trade and companies register) 109 122 150 — SIRET
              109 122 150 00013</li>
            <li>Email: {mail} — telephone:{' '}
              <a href="tel:+33783289106" style={{ color: 'var(--gold-pale)' }}>
                +33 7 83 28 91 06</a></li>
            <li>Intra-EU VAT number:{' '}
              <Todo>VAT regime still to be settled with the accountant (Dougs)</Todo></li>
          </List>
          <p style={{ marginTop: 10 }}>
            The full particulars are set out in our{' '}
            <Link href="/mentions-legales" style={{ color: 'var(--gold-pale)' }}>legal
            notice</Link>.
          </p>
        </>
      ),
    },
    offers: {
      title: '2. The offers and their essential characteristics',
      body: (
        <>
          <SubscriptionOffer />
          <p style={{ marginTop: 10 }}>
            The service is accessible from a recent web browser and, for the desktop application,
            under Windows 10 or 11. Some features require a Riot Games account to be linked and
            depend on the availability of the Riot Games API.
          </p>
        </>
      ),
    },
    price: {
      title: '3. Price and payment',
      body: (
        <>
          <PaymentTerms />
          <div style={{ marginTop: 16 }}>
            <PriceChanges />
          </div>
        </>
      ),
    },
    order: {
      title: '4. Ordering',
      body: (
        <>
          <p>Subscribing takes place online, in four steps:</p>
          <List>
            <li>choice of tier and of billing frequency (monthly or annual) on the pricing
              table;</li>
            <li>signing in to your Wyrm Forge account, or creating that account;</li>
            <li>a summary of the tier, of the price and of the renewal conditions, and confirmation
              of your request for immediate access to the service (see article 6) — without that
              confirmation, payment cannot be started;</li>
            <li>payment on Stripe&apos;s secure page, where you can enter a promotional code and
              check the exact amount before confirming.</li>
          </List>
          <p style={{ marginTop: 10 }}>
            The contract is concluded when the payment is confirmed. Your tier is activated in the
            moments that follow, on the website as well as in the application.
          </p>
          <p style={{ marginTop: 10 }}>
            A confirmation of your order is sent to you by email within minutes of the payment: it
            restates the tier, the price, the billing frequency, the date of the first charge and of
            the next due date, your right of withdrawal and the exact wording of your request for
            immediate access, with a link to these terms.
          </p>
        </>
      ),
    },
    term: {
      title: '5. Term, renewal and cancellation',
      body: (
        <>
          <CancellationTerms />

          <p style={{ marginTop: 16 }}><strong>Annual subscription — information before
            renewal</strong></p>
          <p>
            For an annual subscription, we inform you in writing, by an email sent no earlier than
            three months and no later than one month before the end of your annual period, of the
            date on which it will be renewed and of the possibility of not renewing it (article
            L215-1 of the French Consumer Code). If that information has not been sent to you within
            those time limits, you may cancel your subscription free of charge at any time from the
            renewal date: the sums paid for the period after the cancellation are then refunded to
            you within thirty days.
          </p>

          <p style={{ marginTop: 16 }}><strong>Non-payment</strong></p>
          <UnpaidPolicy />
        </>
      ),
    },
    withdrawal: {
      title: '6. Right of withdrawal',
      body: (
        <>
          <p>
            You have <strong>14 days</strong> from the conclusion of the contract to withdraw,
            without having to give reasons for your decision or to pay a penalty (articles L221-18
            et seq. of the French Consumer Code).
          </p>

          <p style={{ marginTop: 16 }}><strong>Immediate access to the service</strong></p>
          <p>
            A subscription gives access to the service as soon as payment is made. Before you pay,
            we therefore ask you to confirm expressly, by ticking a box, that you wish the service
            to begin immediately, before the end of the withdrawal period. That request does not
            make you lose your right of withdrawal: if you withdraw within the 14 days, you remain
            liable for the <strong>amount corresponding to the service supplied up to your
            withdrawal</strong>, in proportion to the price of the period subscribed for. That
            amount is calculated to the day: price of the period × number of days elapsed between
            the subscription and the receipt of your decision ÷ number of days in the period. The
            excess is refunded to you.
          </p>
          <p style={{ marginTop: 10 }}>
            Example: an annual subscription at €60 from which you withdraw after 5 days gives rise
            to a refund of €60 − (€60 × 5 ÷ 365), i.e. €59.18.
          </p>
          <p style={{ marginTop: 10 }}>
            In accordance with article L221-28 of the French Consumer Code, the right of withdrawal
            can no longer be exercised once the service has been fully supplied before the end of
            the period, which you acknowledge by ticking the box.
          </p>

          <p style={{ marginTop: 16 }}><strong>How to withdraw</strong></p>
          <p>
            Inform us of your decision before the period expires, by an unambiguous statement — an
            email to {mail} is enough —, or by sending us the form below (annex), by email or by
            post to 5 Rue du 23 Janvier, 21000 Dijon, France. It is enough that your decision be
            sent before the end of the period.
          </p>

          <p style={{ marginTop: 16 }}><strong>Effects of withdrawal</strong></p>
          <p>
            Your subscription is stopped and your account returns to the free tier as soon as your
            withdrawal is taken into account. We refund the sum due to you no later than 14 days
            after being informed of your decision (article L221-24), using the means of payment used
            for the subscription, unless you expressly agree to another means; that refund costs you
            nothing.
          </p>
        </>
      ),
    },
    guarantees: {
      title: '7. Statutory guarantees',
      body: (
        <>
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            border: '1px solid rgba(239,159,39,0.35)', background: 'rgba(239,159,39,0.05)',
          }}>
            <p><strong>Statutory guarantee of conformity — digital content and digital
              services</strong></p>
            <p style={{ marginTop: 8, fontStyle: 'italic' }}>
              The following is an English translation of the notice prescribed by French decree
              No. 2022-424 of 25 March 2022. The prescribed wording exists in French only; the
              French version of this page carries it verbatim.
            </p>
            <p style={{ marginTop: 8 }}>
              The consumer has a period of two years from the supply of the digital content or the
              digital service in which to obtain the implementation of the statutory guarantee of
              conformity, should a lack of conformity appear. For a period of one year from the date
              of supply, the consumer is required to establish only the existence of the lack of
              conformity, and not the date on which it appeared.
            </p>
            <p style={{ marginTop: 8 }}>
              Where the contract provides for the continuous supply of the digital content or the
              digital service over a given period, the statutory guarantee applies throughout the
              period of supply; during that period, the consumer is required to establish only the
              existence of the lack of conformity affecting the digital content or the digital
              service, and not the date on which it appeared.
            </p>
            <p style={{ marginTop: 8 }}>
              The statutory guarantee of conformity entails an obligation for the trader, where
              applicable, to supply all the updates necessary to maintain the conformity of the
              digital content or the digital service.
            </p>
            <p style={{ marginTop: 8 }}>
              The statutory guarantee of conformity entitles the consumer to have the digital
              content or the digital service brought into conformity without undue delay following
              their request, free of charge and without major inconvenience to them.
            </p>
            <p style={{ marginTop: 8 }}>
              The consumer may obtain a reduction in the price while keeping the digital content or
              the digital service, or may terminate the contract and obtain a full refund in return
              for giving up the digital content or the digital service, if:
            </p>
            <List>
              <li>the trader refuses to bring the digital content or the digital service into
                conformity;</li>
              <li>the bringing into conformity of the digital content or the digital service is
                unjustifiably delayed;</li>
              <li>the bringing into conformity of the digital content or the digital service cannot
                take place without costs being imposed on the consumer;</li>
              <li>the bringing into conformity of the digital content or the digital service causes
                a major inconvenience for the consumer;</li>
              <li>the lack of conformity of the digital content or the digital service persists
                despite the trader&apos;s unsuccessful attempt to bring it into conformity.</li>
            </List>
            <p style={{ marginTop: 8 }}>
              The consumer is also entitled to a reduction in the price or to termination of the
              contract where the lack of conformity is so serious as to justify an immediate
              reduction in the price or termination of the contract. The consumer is then not
              required to ask first for the digital content or the digital service to be brought
              into conformity.
            </p>
            <p style={{ marginTop: 8 }}>
              Where the lack of conformity is minor, the consumer is entitled to cancellation of the
              contract only if the contract does not provide for the payment of a price.
            </p>
            <p style={{ marginTop: 8 }}>
              Any period of unavailability of the digital content or the digital service with a view
              to restoring its conformity suspends the guarantee that remained to run until the
              digital content or the digital service is supplied again in conformity.
            </p>
            <p style={{ marginTop: 8 }}>
              These rights result from the application of articles L. 224-25-1 to L. 224-25-31 of
              the French Consumer Code.
            </p>
            <p style={{ marginTop: 8 }}>
              A trader who obstructs in bad faith the implementation of the statutory guarantee of
              conformity incurs a civil fine of up to 300,000 euros, which may be raised to up to
              10% of the average annual turnover (article L. 242-18-1 of the French Consumer Code).
            </p>
            <p style={{ marginTop: 8 }}>
              The consumer also benefits from the statutory guarantee against hidden defects
              (garantie des vices cachés) under articles 1641 to 1649 of the French Civil Code, for
              a period of two years from the discovery of the defect. That guarantee gives a right
              to a reduction in the price if the digital content or the digital service is kept, or
              to a full refund in return for giving up the digital content or the digital service.
            </p>
          </div>
          <p style={{ marginTop: 12 }}>
            To invoke one of these guarantees, write to us following the complaints procedure of
            article 8, describing the defect you have found.
          </p>
        </>
      ),
    },
    complaints: {
      title: '8. Complaints',
      body: (
        <p>
          For any complaint relating to your subscription — billing, access to your tier, failure to
          work —, write to us at {mail}, or by post to 5 Rue du 23 Janvier, 21000 Dijon, France,
          stating the email address of your account and the subject of your request. We acknowledge
          receipt of your complaint and answer it as quickly as possible, and no later than within
          30 days.
        </p>
      ),
    },
    mediation: {
      title: '9. Consumer mediation',
      body: (
        <>
          <p>
            If your written complaint has not succeeded, you may use a consumer mediator
            (médiateur de la consommation) free of charge with a view to an amicable resolution
            (articles L612-1 et seq. of the French Consumer Code), within one year of your
            complaint:
          </p>
          <List>
            <li>Mediator: <Todo>name of the approved mediator</Todo></li>
            <li>Postal address: <Todo>address of the mediator</Todo></li>
            <li>Online referral: <Todo>URL for referring a dispute to the mediator</Todo></li>
          </List>
        </>
      ),
    },
    personalData: {
      title: '10. Personal data',
      body: (
        <p>
          The data needed to manage your subscription, together with the proof of your request for
          immediate access, are processed as described in our{' '}
          <Link href="/confidentialite" style={{ color: 'var(--gold-pale)' }}>privacy
          policy</Link>.
        </p>
      ),
    },
    disputes: {
      title: '11. Governing law and disputes',
      body: (
        <p>
          These terms are governed by French law. Failing an amicable resolution, the dispute may be
          brought, at the consumer&apos;s choice, before one of the courts having territorial
          jurisdiction under the French Code of Civil Procedure, or before the court of the place
          where the consumer was living when the contract was concluded or when the harmful event
          occurred (article R631-3 of the French Consumer Code).
        </p>
      ),
    },
    annex: {
      title: 'Annex — Withdrawal form',
      body: (
        <>
          <p>
            <em>(Complete and return this form only if you wish to withdraw from the contract.)</em>
          </p>
          <div style={{
            marginTop: 10, padding: '14px 16px', borderRadius: 8,
            border: '1px dashed var(--border)', fontSize: 14,
          }}>
            <p>
              To Wyrm Forge, 5 Rue du 23 Janvier, 21000 Dijon, France — contact@wyrm-forge.com:
            </p>
            <p style={{ marginTop: 8 }}>
              I hereby give notice of my withdrawal from the contract for the supply of the
              following service:
            </p>
            <p style={{ marginTop: 8 }}>Subscription (tier and billing frequency):</p>
            <p style={{ marginTop: 8 }}>Subscribed on:</p>
            <p style={{ marginTop: 8 }}>Name of consumer:</p>
            <p style={{ marginTop: 8 }}>Email address of the Wyrm Forge account:</p>
            <p style={{ marginTop: 8 }}>Address of consumer:</p>
            <p style={{ marginTop: 8 }}>
              Signature of consumer (only if this form is notified on paper):
            </p>
            <p style={{ marginTop: 8 }}>Date:</p>
          </div>
        </>
      ),
    },
  },
}

export const cgvDicts: Record<Lang, CgvDict> = {
  fr: cgvFr,
  en: cgvEn,
}

/**
 * Dictionnaire des CGV dans la langue courante.
 *
 * Un hook PAR DOCUMENT, et pas un `useLegal()` global : chaque page légale est
 * une route distincte, et un hook global ferait entrer les quatre documents dans
 * le bundle de chacune. Même raisonnement que `useDashboard()` vs la vitrine.
 */
export const useCgv = (): CgvDict => cgvDicts[useLanguage().lang]

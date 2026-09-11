import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, List, Todo } from '@/components/legal/LegalPage'
import {
  SubscriptionOffer,
  PaymentTerms,
  CancellationTerms,
  UnpaidPolicy,
  PriceChanges,
} from '@/components/legal/SubscriptionTerms'

/* Conditions générales de vente — abonnements Forgeron et Maître.
 *
 * Informations précontractuelles de l'art. L221-5 du Code de la consommation.
 * Route dédiée plutôt qu'une section en fin de /cgu : le lien « conditions
 * générales de vente » de la modale de paiement doit mener à un document
 * identifiable en tant que tel, et le site n'a pas de routage i18n par URL
 * (la langue est un état client) — il n'y avait donc aucune structure de
 * routes localisées à respecter. Version française seule : la traduction est
 * un chantier séparé.
 *
 * ⚠️ HORS PÉRIMÈTRE : le « Kit sur mesure » (prestation à distance avec
 * acompte/solde, rétractation pleinement applicable, parcours en 8 états) aura
 * ses propres conditions. Ne pas l'ajouter ici.
 *
 * ⚠️ `updated` DOIT correspondre à `CGV_VERSION` (src/lib/stripe/checkout-
 * consent.ts) : c'est la version enregistrée avec chaque preuve de
 * consentement. `checkout-consent.test.ts` relit cette ligne et échoue si les
 * deux divergent. Toute modification de fond de ce document = avancer les deux.
 */

export const metadata: Metadata = {
  title: 'Conditions générales de vente — Wyrm Forge',
  description: 'Conditions de vente des abonnements Wyrm Forge : prix, paiement, reconduction, résiliation, droit de rétractation, garanties légales et réclamations.',
}

const mail = (
  <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
    contact@wyrm-forge.com
  </a>
)

export default function CgvPage() {
  return (
    <LegalPage
      title="Conditions générales"
      accent="de vente"
      updated="11 septembre 2026"
      current="/cgv"
      intro={<>
        Ces conditions régissent la vente à distance des abonnements payants Wyrm Forge
        (paliers Forgeron et Maître) à toute personne physique agissant à des fins non
        professionnelles. Elles complètent les{' '}
        <Link href="/cgu" style={{ color: 'var(--gold-pale)' }}>conditions générales
        d&apos;utilisation</Link>, qui régissent l&apos;usage du service lui-même. Tu les acceptes
        au moment de ta souscription ; la version applicable est celle en vigueur à cette date.
      </>}
    >
      <Section title="1. Le vendeur">
        {/* Identité reprise de mentions-legales/page.tsx (chantier du 2026-09-11).
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
      </Section>

      <Section title="2. Les offres et leurs caractéristiques essentielles">
        <SubscriptionOffer />
        <p style={{ marginTop: 10 }}>
          Le service est accessible depuis un navigateur web récent et, pour l&apos;application de
          bureau, sous Windows 10 ou 11. Certaines fonctionnalités nécessitent de lier un compte
          Riot Games et dépendent de la disponibilité de l&apos;API de Riot Games.
        </p>
      </Section>

      <Section title="3. Prix et paiement">
        <PaymentTerms />
        <div style={{ marginTop: 16 }}>
          <PriceChanges />
        </div>
      </Section>

      <Section title="4. Commande">
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
            Services, C-49/11). Joindre les CGV en PDF serait la forme la plus sûre. */}
        <p style={{ marginTop: 10 }}>
          Une confirmation de ta commande t&apos;est adressée par e-mail dans les minutes qui
          suivent le paiement : elle reprend le palier, le prix, la périodicité, la date du
          premier prélèvement et de la prochaine échéance, ton droit de rétractation et le
          texte exact de ta demande d&apos;accès immédiat, avec un lien vers les présentes
          conditions.
        </p>
      </Section>

      <Section title="5. Durée, renouvellement et résiliation">
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
      </Section>

      <Section title="6. Droit de rétractation">
        <p>
          Tu disposes d&apos;un délai de <strong>14 jours</strong> à compter de la conclusion du
          contrat pour te rétracter, sans avoir à justifier ta décision ni à payer de pénalité
          (articles L221-18 et suivants du Code de la consommation).
        </p>

        <p style={{ marginTop: 16 }}><strong>Accès immédiat au service</strong></p>
        {/* Art. L221-25. Le texte exact de la case, versionné, est dans
            src/lib/stripe/checkout-consent.ts — ce paragraphe en explique la
            portée, il ne le remplace pas. */}
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
      </Section>

      <Section title="7. Garanties légales">
        {/* Reproduit d'après le modèle d'information du décret n° 2022-424 du
            25 mars 2022 pour les contenus et services numériques.
            ⚠️ À COMPLÉTER PAR HORTAL — faire vérifier ce texte MOT POUR MOT contre
            Légifrance par le juriste : c'est un encadré réglementaire, sa
            formulation n'est pas libre. */}
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
      </Section>

      <Section title="8. Réclamations">
        <p>
          Pour toute réclamation relative à ton abonnement — facturation, accès à ton palier,
          défaut de fonctionnement —, écris-nous à {mail}, ou par courrier au 5 Rue du 23 Janvier,
          21000 Dijon, en indiquant l&apos;adresse e-mail de ton compte et l&apos;objet de ta
          demande. Nous accusons réception de ta réclamation et y répondons dans les meilleurs
          délais, et au plus tard sous 30 jours.
        </p>
      </Section>

      <Section title="9. Médiation de la consommation">
        {/* À COMPLÉTER PAR HORTAL — médiateur non encore choisi. Reporter les mêmes
            informations ici, dans les CGU § 13 et dans les mentions légales § 7. */}
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
      </Section>

      <Section title="10. Données personnelles">
        <p>
          Les données nécessaires à la gestion de ton abonnement, ainsi que la preuve de ta
          demande d&apos;accès immédiat, sont traitées comme décrit dans notre{' '}
          <Link href="/confidentialite" style={{ color: 'var(--gold-pale)' }}>politique de
          confidentialité</Link>.
        </p>
      </Section>

      <Section title="11. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au droit français. À défaut de résolution
          amiable, le litige peut être porté, au choix du consommateur, devant l&apos;une des
          juridictions territorialement compétentes en vertu du Code de procédure civile, ou
          devant la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou
          de la survenance du fait dommageable (article R631-3 du Code de la consommation).
        </p>
      </Section>

      <Section title="Annexe — Formulaire de rétractation">
        {/* Modèle de l'annexe à l'article R221-1 du Code de la consommation,
            complété des coordonnées du vendeur et adapté à une prestation de
            services. */}
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
      </Section>
    </LegalPage>
  )
}

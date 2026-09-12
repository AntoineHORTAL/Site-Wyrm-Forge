import { describe, it, expect } from 'vitest'
import { LANG_PARAM, langFromSearch, resolveInitialLang, withLangParam } from './lang-param'

/**
 * La règle de priorité de la langue au premier rendu client.
 *
 * Le paramètre `?lang=` n'existe que pour UN cas : les liens envoyés par
 * e-mail. Le destinataire d'un e-mail anglais qui l'ouvre depuis l'application
 * mail de son téléphone arrive dans un navigateur qui n'a jamais visité le site,
 * donc sans `wf-lang` — sans le paramètre, il tombe sur la version française.
 *
 * Deux propriétés se testent ici, et la seconde autant que la première :
 *   • un lien estampillé impose sa langue, MÊME sans préférence locale ;
 *   • la navigation normale n'est pas touchée — pas de paramètre ⇒ la
 *     préférence stockée décide, et son absence ne déclenche rien du tout.
 *
 * Module PUR, testé sans jsdom (que le repo n'installe pas) : `LanguageProvider`
 * ne fait que lui passer `window.location.search` et la valeur du stockage.
 */

describe('langue demandée par l’URL', () => {
  it('reconnaît les deux langues du site', () => {
    expect(langFromSearch('?lang=fr')).toBe('fr')
    expect(langFromSearch('?lang=en')).toBe('en')
  })

  it('tolère la casse et les espaces, mais rien de plus', () => {
    expect(langFromSearch('?lang=EN')).toBe('en')
    expect(langFromSearch('?lang=%20en%20')).toBe('en')
    // STRICT à dessein : cette valeur est produite par NOS liens. Une étiquette
    // régionale ou une langue inconnue vient d'ailleurs — on ignore et on garde
    // la préférence habituelle du visiteur plutôt que de deviner.
    for (const s of ['?lang=en-GB', '?lang=de', '?lang=', '?lang=1']) {
      expect(langFromSearch(s), s).toBeNull()
    }
  })

  it('trouve le paramètre où qu’il soit dans la query', () => {
    expect(langFromSearch('?utm_source=email&lang=en')).toBe('en')
    expect(langFromSearch('lang=en')).toBe('en')
  })

  it('ignore une query absente, vide ou illisible', () => {
    for (const s of ['', '?', '?other=1', '?lang=%E0%A4%A']) {
      expect(langFromSearch(s), JSON.stringify(s)).toBeNull()
    }
  })
})

describe('🔴 langue initiale — URL > préférence stockée > rien', () => {
  it('un lien d’e-mail impose sa langue SANS préférence locale préexistante', () => {
    // Le cas que ce paramètre existe pour résoudre.
    expect(resolveInitialLang('?lang=en', null)).toEqual({ lang: 'en', source: 'url' })
  })

  it('le lien l’emporte sur une préférence contraire déjà stockée', () => {
    // Signal le plus récent et le plus explicite : cliquer le lien d'un e-mail
    // anglais, c'est demander à lire cette page en anglais.
    expect(resolveInitialLang('?lang=en', 'fr')).toEqual({ lang: 'en', source: 'url' })
    expect(resolveInitialLang('?lang=fr', 'en')).toEqual({ lang: 'fr', source: 'url' })
  })

  it('sans paramètre, la préférence stockée décide — navigation normale inchangée', () => {
    expect(resolveInitialLang('', 'en')).toEqual({ lang: 'en', source: 'storage' })
    expect(resolveInitialLang('', 'fr')).toEqual({ lang: 'fr', source: 'storage' })
    expect(resolveInitialLang('?tab=builds', 'en')).toEqual({ lang: 'en', source: 'storage' })
  })

  it('ni paramètre ni préférence ⇒ `null` : l’appelant ne touche à rien', () => {
    // `null` et pas `{ lang: 'fr' }` : le provider reste sur son état initial et
    // n'ÉCRIT RIEN dans le stockage. Un visiteur qui n'a jamais choisi de langue
    // ne doit pas se retrouver avec une préférence qu'il n'a pas exprimée.
    expect(resolveInitialLang('', null)).toBeNull()
    expect(resolveInitialLang('?lang=de', null)).toBeNull()
    expect(resolveInitialLang('', 'klingon')).toBeNull()
  })

  it('une valeur stockée devenue illisible ne bloque pas un lien estampillé', () => {
    expect(resolveInitialLang('?lang=en', 'klingon')).toEqual({ lang: 'en', source: 'url' })
  })
})

describe('construction des liens sortants', () => {
  it('ajoute le paramètre, en respectant une query déjà présente', () => {
    expect(withLangParam('https://wyrm-forge.com/cgv', 'en')).toBe('https://wyrm-forge.com/cgv?lang=en')
    expect(withLangParam('https://wyrm-forge.com/profil?tab=abo', 'fr'))
      .toBe('https://wyrm-forge.com/profil?tab=abo&lang=fr')
  })

  it('ce qu’il construit est relu par `langFromSearch`', () => {
    for (const lang of ['fr', 'en'] as const) {
      const url = withLangParam('https://wyrm-forge.com/cgv', lang)
      expect(langFromSearch(url.slice(url.indexOf('?')))).toBe(lang)
    }
  })

  it('le nom du paramètre est bien `lang`', () => {
    // Il est écrit une seconde fois côté e-mails (module Deno, qui ne peut pas
    // importer `src/`) : `subscription-emails-worker.test.ts` compare le lien
    // rendu à cette constante.
    expect(LANG_PARAM).toBe('lang')
  })
})

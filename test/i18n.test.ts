import { describe, expect, it } from 'vitest';
import { CORE_LAYER, LANGUAGES, type I18nLayer, coreT, createI18n, flatten, haLocalize, humanize, num, numAuto, rawLanguage, resolveLanguage, translated } from '../src/i18n';

const EM_DASH = String.fromCharCode(0x2014);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const EN = CORE_LAYER.en;

describe('core layer', () => {
  it('ships en, nl, de, fr, es and it', () => {
    expect(Object.keys(CORE_LAYER).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'nl']);
    expect([...LANGUAGES].sort()).toEqual(Object.keys(CORE_LAYER).sort());
  });
  it('keeps every key under core.', () => {
    expect(Object.keys(EN).filter((k) => !k.startsWith('core.'))).toEqual([]);
  });
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    it(`${lang} has exactly the keys and placeholders of en`, () => {
      const L = CORE_LAYER[lang];
      expect({ missing: Object.keys(EN).filter((k) => !(k in L)), extra: Object.keys(L).filter((k) => !(k in EN)) }).toEqual({ missing: [], extra: [] });
      expect(Object.keys(EN).filter((k) => placeholders(EN[k]).join() !== placeholders(L[k]).join())).toEqual([]);
    });
  }
  for (const [lang, L] of Object.entries(CORE_LAYER)) {
    it(`${lang}: no empty values and no em-dash`, () => {
      expect(Object.entries(L).filter(([, v]) => !v.trim() || v.includes(EM_DASH))).toEqual([]);
    });
  }
  it('flatten makes dotted keys', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' });
  });
});

describe('language resolution', () => {
  it('prefers hass.locale.language, then hass.language, then en', () => {
    expect(resolveLanguage({ locale: { language: 'nl' }, language: 'de' })).toBe('nl');
    expect(resolveLanguage({ language: 'de' })).toBe('de');
    expect(resolveLanguage({})).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
  });
  it('falls back from a region to the language, ignoring case and _ or -', () => {
    expect(resolveLanguage({ language: 'nl-BE' })).toBe('nl');
    expect(resolveLanguage({ language: 'NL_be' })).toBe('nl');
    expect(resolveLanguage({ locale: { language: 'de-AT' } })).toBe('de');
    expect(resolveLanguage({ language: 'fr_CA' })).toBe('fr');
  });
  it('an unsupported language is English (pt-BR has no pt)', () => {
    expect(resolveLanguage({ language: 'pt-BR' })).toBe('en');
    expect(resolveLanguage({ language: 'ja' })).toBe('en');
  });
  it('rawLanguage keeps the tag as written', () => {
    expect(rawLanguage({ language: 'nl-BE' })).toBe('nl-BE');
  });
});

describe('t', () => {
  const layer = { en: { 'x.hello': 'Hello {name}', 'x.only': 'English only' }, nl: { 'x.hello': 'Hallo {name}' } };
  const { t, locales } = createI18n([layer]);

  it('translates, fills {vars}, falls back to en and then to the key', () => {
    expect(t({ language: 'nl' }, 'core.off')).toBe(CORE_LAYER.nl['core.off']);
    expect(t({ language: 'nl' }, 'core.off')).not.toBe(EN['core.off']);
    expect(t(undefined, 'x.hello', { name: 'Ann' })).toBe('Hello Ann');
    expect(t({ language: 'nl' }, 'x.hello', { name: 'Ann' })).toBe('Hallo Ann');
    expect(t({ language: 'nl' }, 'x.only')).toBe('English only');
    expect(t({ language: 'nl' }, 'no.such.key')).toBe('no.such.key');
  });
  it('a language only a layer has is available', () => {
    const i = createI18n([{ xx: { 'x.a': 'xx a' }, en: { 'x.a': 'en a' } }]);
    expect(i.t({ language: 'xx' }, 'x.a')).toBe('xx a');
    expect(i.resolveLanguage({ language: 'xx-YY' })).toBe('xx');
    expect(i.resolveLanguage({ language: 'nl' })).toBe('nl');
  });
  it('only own variables fill a placeholder', () => {
    expect(t(undefined, 'x.hello', {})).toBe('Hello {name}');
    expect(t(undefined, 'x.hello', { constructor: 'x' })).toBe('Hello {name}');
  });
  it('leaves an unknown {var} as it is', () => {
    expect(t(undefined, 'core.percent', { n: 2 })).toBe('{value}%');
  });
  it('exposes the merged locales', () => {
    expect(locales.nl['x.hello']).toBe('Hallo {name}');
    expect(locales.nl['core.close']).toBe('Sluiten');
  });
  it('coreT has the core strings only', () => {
    expect(coreT({ language: 'fr' }, 'core.close')).toBe('Fermer');
    expect(coreT(undefined, 'x.hello')).toBe('x.hello');
    expect(coreT({ language: 'fr' }, 'core.percent', { value: 5 })).toBe('5 %');
  });
});

describe('layer order', () => {
  it('product wins over core, card over product', () => {
    const product = { en: { 'core.close': 'Product close', 'card.title': 'Product title' } };
    const card = { en: { 'card.title': 'Card title' } };
    const { t } = createI18n([product, card]);
    expect(t(undefined, 'core.close')).toBe('Product close');
    expect(t(undefined, 'card.title')).toBe('Card title');
    expect(createI18n([]).t(undefined, 'core.close')).toBe('Close');
  });
  it('is decided per language: a product string in nl beats the core nl string, not the other way round', () => {
    const { t } = createI18n([{ nl: { 'core.close': 'Dicht' } }]);
    expect(t({ language: 'nl' }, 'core.close')).toBe('Dicht');
    expect(t({ language: 'de' }, 'core.close')).toBe('Schließen');
  });
  it('does not change the layers it is given', () => {
    const product = { en: { 'core.close': 'P' } };
    createI18n([product]);
    expect(product).toEqual({ en: { 'core.close': 'P' } });
    expect(CORE_LAYER.en['core.close']).toBe('Close');
  });
  it('works as Liquid Home calls it: createI18n([product, ...cards]) and destructure t', () => {
    const cards: I18nLayer[] = [{ en: { 'light.name': 'Light' } }, { en: { 'tile.name': 'Tile' } }];
    const { t } = createI18n([{ en: { 'common.x': 'X' } }, ...cards]);
    expect([t(undefined, 'common.x'), t(undefined, 'light.name'), t(undefined, 'tile.name')]).toEqual(['X', 'Light', 'Tile']);
  });
});

describe('numbers', () => {
  it('follows the language', () => {
    expect(num({ language: 'en' }, 21.5, 1)).toBe('21.5');
    expect(num({ language: 'nl' }, 21.5, 1)).toBe('21,5');
    expect(num({ locale: { language: 'de' } }, 1234.5, 1)).toBe('1234,5');
    expect(num(undefined, 21, 1)).toBe('21.0');
  });
  it('follows the number format setting', () => {
    expect(num({ language: 'nl', locale: { language: 'nl', number_format: 'comma_decimal' } }, 21.5, 1)).toBe('21.5');
    expect(num({ language: 'en', locale: { language: 'en', number_format: 'decimal_comma' } }, 21.5, 1)).toBe('21,5');
    expect(num({ language: 'en', locale: { language: 'en', number_format: 'space_comma' } }, 21.5, 1)).toBe('21,5');
    expect(num({ locale: { language: 'nl', number_format: 'language' } }, 21.5, 1)).toBe('21,5');
  });
  it('number_format none is plain: dot decimal, no grouping, whatever the language', () => {
    expect(num({ language: 'nl', locale: { language: 'nl', number_format: 'none' } }, 21.5, 1)).toBe('21.5');
    expect(num({ language: 'de', locale: { language: 'de', number_format: 'none' } }, 12345.5, 1)).toBe('12345.5');
  });
  it('clamps the digits to 0..20 instead of throwing', () => {
    expect(num({ language: 'en' }, 21.5, -3)).toBe('22');
    expect(num({ language: 'en' }, 21.5, 99)).toBe(`21.5${'0'.repeat(19)}`);
    expect(num({ language: 'en' }, 21.5, NaN)).toBe('22');
  });
  it('survives a tag Intl rejects', () => {
    expect(num({ language: 'not a tag!' }, 21.5, 1)).toBe('21.5');
  });
  it('numAuto keeps whole numbers whole', () => {
    expect(numAuto({ language: 'nl' }, 21, 1)).toBe('21');
    expect(numAuto({ language: 'nl' }, 21.25, 1)).toBe('21,3');
  });
});

describe("Home Assistant's own translations", () => {
  const withMap = (map: Record<string, string>) => ({ language: 'nl', localize: (k: string) => map[k] ?? '' });

  it('haLocalize uses localize when it answers', () => {
    expect(haLocalize(withMap({ a: 'A (HA)' }), 'a')).toBe('A (HA)');
  });
  it('returns an empty string when localize answers with an empty string, is missing or throws', () => {
    expect(haLocalize(withMap({}), 'a')).toBe('');
    expect(haLocalize({ language: 'nl' }, 'a')).toBe('');
    expect(
      haLocalize(
        {
          language: 'nl',
          localize: () => {
            throw new Error('x');
          },
        },
        'a',
      ),
    ).toBe('');
    expect(haLocalize(undefined, 'x')).toBe('');
  });
  it('humanize', () => {
    expect(humanize('some_value')).toBe('Some value');
  });
  it('translated: only a text that differs from the value counts', () => {
    expect(translated(undefined, 'stop')).toBe(false);
    expect(translated('', 'stop')).toBe(false);
    expect(translated('key', 'stop', 'key')).toBe(false);
    expect(translated('stop', 'stop')).toBe(false);
    expect(translated('Stop', 'stop')).toBe(false);
    expect(translated('Some value', 'some_value')).toBe(false);
    expect(translated('ECO', 'eco')).toBe(true);
    expect(translated('Halt', 'stop')).toBe(true);
  });
});

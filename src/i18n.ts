import type { HomeAssistant } from './types';

// Copied from Liquid Climate 0.11.1 (src/i18n/index.ts, commit 373b340). The helpers are generic; the
// climate-only ones (haMode, optionName, the mode and option strings) stay in Liquid Climate.

type Tree = { [key: string]: string | Tree };
export type Vars = Record<string, string | number>;
/** What the helpers need of hass; a missing hass means English. */
export type I18nHass = Partial<Pick<HomeAssistant, 'locale' | 'language' | 'localize' | 'formatEntityAttributeValue'>> | null | undefined;
/** Strings per language, keyed by flat dotted key: { nl: { 'card.name': 'x' } }. */
export type I18nLayer = Record<string, Record<string, string>>;

/** The six shipped languages. */
export const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es', 'it'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Nested JSON to dotted keys: { dial: { sending: "x" } } becomes { "dial.sending": "x" }. */
export function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else Object.assign(out, flatten(v, `${prefix}${k}.`));
  }
  return out;
}

// ---- Core strings --------------------------------------------------------------

/** What liquid-core's own components say (sheet close label, slider text, editor helpers), under `core.*`. */
const CORE: Record<Language, Tree> = {
  en: {
    close: 'Close',
    history: 'History',
    off: 'Off',
    unavailable: 'Unavailable',
    percent: '{value}%',
    editor: {
      help: 'Help: {section}',
      glass: 'Glass',
      glassAuto: 'Auto',
      glassDark: 'Dark',
      glassLight: 'Light',
      tint: 'Mode tint',
      blur: 'Blur',
      motion: 'Motion',
      motionRich: 'Rich',
      motionSubtle: 'Subtle',
      motionMinimal: 'Minimal',
      reducedMotion: 'Reduced motion in the OS always wins.',
    },
  },
  nl: {
    close: 'Sluiten',
    history: 'Geschiedenis',
    off: 'Uit',
    unavailable: 'Niet beschikbaar',
    percent: '{value}%',
    editor: {
      help: 'Help: {section}',
      glass: 'Glas',
      glassAuto: 'Auto',
      glassDark: 'Donker',
      glassLight: 'Licht',
      tint: 'Modustint',
      blur: 'Vervaging',
      motion: 'Beweging',
      motionRich: 'Uitgebreid',
      motionSubtle: 'Subtiel',
      motionMinimal: 'Minimaal',
      reducedMotion: 'Verminderde beweging in het besturingssysteem gaat altijd voor.',
    },
  },
  de: {
    close: 'Schließen',
    history: 'Verlauf',
    off: 'Aus',
    unavailable: 'Nicht verfügbar',
    percent: '{value} %',
    editor: {
      help: 'Hilfe: {section}',
      glass: 'Glas',
      glassAuto: 'Auto',
      glassDark: 'Dunkel',
      glassLight: 'Hell',
      tint: 'Modusfarbe',
      blur: 'Unschärfe',
      motion: 'Bewegung',
      motionRich: 'Intensiv',
      motionSubtle: 'Dezent',
      motionMinimal: 'Minimal',
      reducedMotion: 'Reduzierte Bewegung im Betriebssystem hat immer Vorrang.',
    },
  },
  fr: {
    close: 'Fermer',
    history: 'Historique',
    off: 'Arrêt',
    unavailable: 'Indisponible',
    percent: '{value} %',
    editor: {
      help: 'Aide : {section}',
      glass: 'Verre',
      glassAuto: 'Auto',
      glassDark: 'Sombre',
      glassLight: 'Clair',
      tint: 'Teinte du mode',
      blur: 'Flou',
      motion: 'Animation',
      motionRich: 'Complète',
      motionSubtle: 'Discrète',
      motionMinimal: 'Minimale',
      reducedMotion: 'La réduction des animations du système prime toujours.',
    },
  },
  es: {
    close: 'Cerrar',
    history: 'Historial',
    off: 'Apagado',
    unavailable: 'No disponible',
    percent: '{value} %',
    editor: {
      help: 'Ayuda: {section}',
      glass: 'Cristal',
      glassAuto: 'Auto',
      glassDark: 'Oscuro',
      glassLight: 'Claro',
      tint: 'Tinte del modo',
      blur: 'Desenfoque',
      motion: 'Movimiento',
      motionRich: 'Completo',
      motionSubtle: 'Sutil',
      motionMinimal: 'Mínimo',
      reducedMotion: 'La reducción de movimiento del sistema siempre tiene prioridad.',
    },
  },
  it: {
    close: 'Chiudi',
    history: 'Storico',
    off: 'Spento',
    unavailable: 'Non disponibile',
    percent: '{value}%',
    editor: {
      help: 'Aiuto: {section}',
      glass: 'Vetro',
      glassAuto: 'Auto',
      glassDark: 'Scuro',
      glassLight: 'Chiaro',
      tint: 'Tinta della modalità',
      blur: 'Sfocatura',
      motion: 'Movimento',
      motionRich: 'Ricco',
      motionSubtle: 'Discreto',
      motionMinimal: 'Minimo',
      reducedMotion: 'La riduzione del movimento del sistema ha sempre la precedenza.',
    },
  },
};

/** The core layer: every language, keys under `core.`. Always the first layer of a createI18n result. */
export const CORE_LAYER: I18nLayer = Object.fromEntries(LANGUAGES.map((l) => [l, flatten(CORE[l], 'core.')]));

// ---- Languages -----------------------------------------------------------------

/** The language tag Home Assistant reports for this user, as written. */
export function rawLanguage(hass: I18nHass): string {
  const l = hass?.locale?.language || hass?.language;
  return typeof l === 'string' && l ? l : 'en';
}

/** The tag, else its base (nl-BE becomes nl), else en (pt-BR has no pt, so en), among the languages in `locales`. */
function pickLanguage(hass: I18nHass, locales: Record<string, unknown>): string {
  const tag = rawLanguage(hass).toLowerCase().replace(/_/g, '-');
  if (locales[tag]) return tag;
  const base = tag.split('-')[0];
  return locales[base] ? base : 'en';
}

/** The language of our strings among the shipped ones. */
export const resolveLanguage = (hass: I18nHass): string => pickLanguage(hass, CORE_LAYER);

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : m)) : text;
}

export interface I18n {
  /** The string for `key` in the user's language, then English, then the key itself. {name} placeholders are filled from vars. */
  t(hass: I18nHass, key: string, vars?: Vars): string;
  /** The merged strings per language (core, then each layer; later wins). Mutable, like Liquid Climate's LOCALES. */
  locales: Record<string, Record<string, string>>;
  resolveLanguage(hass: I18nHass): string;
}

/**
 * Merge string layers into one `t`. Order of precedence, lowest first: core (prepended here, `core.*`
 * keys), then the layers as given. Liquid Home passes [product, ...cards], so product wins over core
 * and a card wins over product; layers have their own key prefixes, so a clash is a deliberate override.
 * Merging is per language, so a layer that lacks a language leaves the earlier layers' strings in place,
 * and a key found in no layer of the user's language comes from English.
 */
export function createI18n(layers: I18nLayer[]): I18n {
  const locales: Record<string, Record<string, string>> = {};
  for (const layer of [CORE_LAYER, ...layers]) {
    for (const [lang, strings] of Object.entries(layer)) Object.assign((locales[lang] ??= {}), strings);
  }
  locales.en ??= {};
  return {
    locales,
    resolveLanguage: (hass) => pickLanguage(hass, locales),
    t: (hass, key, vars) => fill(locales[pickLanguage(hass, locales)][key] ?? locales.en[key] ?? key, vars),
  };
}

/** The core strings alone: for core components used without a product (and the default of LiquidSheetBase). */
export const { t: coreT } = createI18n([]);

// ---- Numbers -------------------------------------------------------------------

const formats = new Map<string, Intl.NumberFormat>();

/** The locale tag for Intl, following the user's number format setting when it names one. */
function numberLocale(hass: I18nHass): string | undefined {
  switch (hass?.locale?.number_format) {
    case 'comma_decimal':
      return 'en-US';
    case 'decimal_comma':
      return 'de';
    case 'space_comma':
      return 'fr';
    case 'none':
      return 'en-US';
    case 'system':
      return undefined;
    default:
      return rawLanguage(hass).replace(/_/g, '-');
  }
}

/** A number with a fixed count of decimals, in the user's number format. Never grouped, so 1000 stays 1000. */
export function num(hass: I18nHass, value: number, digits = 1): string {
  digits = Math.min(20, Math.max(0, Math.trunc(digits) || 0));
  const tag = numberLocale(hass);
  const key = `${tag}|${digits}`;
  let f = formats.get(key);
  if (!f) {
    const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false };
    try {
      f = new Intl.NumberFormat(tag, opts);
    } catch {
      f = new Intl.NumberFormat('en', opts);
    }
    formats.set(key, f);
  }
  return f.format(value);
}

/** Whole numbers stay whole, others get `digits` decimals. */
export const numAuto = (hass: I18nHass, value: number, digits: number): string => num(hass, value, Number.isInteger(value) ? 0 : digits);

// ---- Home Assistant's own translations -------------------------------------------

/** hass.localize, or an empty string when it is missing (tests, dev harness) or knows no such key. */
export function haLocalize(hass: I18nHass, key: string): string {
  try {
    const v = hass?.localize?.(key);
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

/** First letter capitalised, underscores as spaces: the last resort for a value nobody translated. */
export function humanize(v: string): string {
  const s = v.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Home Assistant has no translation for a value when it answers nothing, the key it was asked for, the value itself, or the
 * value dressed up (capitalised: "stop" becomes "Stop"). None of these is an answer. A real formatting ("ECO") is kept.
 */
export const translated = (text: string | undefined, value: string, key?: string): text is string =>
  !!text && text !== key && text !== value && text !== humanize(value) && text !== value.charAt(0).toUpperCase() + value.slice(1);

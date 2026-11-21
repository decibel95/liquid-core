import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

// Copied from Liquid Climate 0.11.1 (card editor, commit 373b340) as plain
// template functions: the product's editor class owns state and config, these only draw fields.
// Strings come from the product's `t`, which must resolve the `core.editor.*` keys of the core layer.

/** The product's translate function (see createI18n). */
export type EditorT = (key: string, vars?: Record<string, string | number>) => string;

/** A labelled radio group (a segmented control). Calls `onChange` with the picked value. */
export function segField<V extends string>(
  label: string,
  value: V,
  options: readonly (readonly [V, string])[],
  onChange: (value: V) => void,
): TemplateResult {
  return html`
    <div class="field">
      <span class="lbl">${label}</span>
      <div class="seg" role="radiogroup" aria-label=${label}>
        ${options.map(
          ([v, l]) => html`<button
            role="radio"
            aria-checked=${value === v ? 'true' : 'false'}
            class=${value === v ? 'on' : ''}
            @click=${() => onChange(v)}
          >
            ${l}
          </button>`,
        )}
      </div>
    </div>
  `;
}

export interface LookValues {
  glass: 'theme' | 'dark' | 'light';
  blur: number;
  motion: 'rich' | 'subtle' | 'minimal';
  /** Only read when `opts.tint` is set (Liquid Climate). A fraction, 0 to 0.3. */
  tint?: number;
}

/**
 * The look section: glass, blur, motion and the reduced-motion hint. `opts.tint` adds the mode tint
 * slider for products that have one (Liquid Climate); Liquid Home has no look.tint and leaves it out.
 * `onChange` gets the changed option only, for example { blur: 24 } or { tint: 0.1 }.
 */
export function lookFields(
  look: LookValues,
  t: EditorT,
  onChange: (patch: Partial<LookValues>) => void,
  opts: { tint?: boolean } = {},
): TemplateResult {
  // One wrapper element (display: contents, see editorStyles): a template that starts with an
  // expression loses its first markers in happy-dom, and the tests render there.
  return html`<div class="look">
    ${segField(
      t('core.editor.glass'),
      look.glass,
      [
        ['theme', t('core.editor.glassAuto')],
        ['dark', t('core.editor.glassDark')],
        ['light', t('core.editor.glassLight')],
      ],
      (glass) => onChange({ glass }),
    )}
    ${opts.tint
      ? html`<label class="field">
          <span class="lbl range"><span>${t('core.editor.tint')}</span><span>${Math.round((look.tint ?? 0) * 100)}%</span></span>
          <input
            type="range"
            min="0"
            max="30"
            .value=${String(Math.round((look.tint ?? 0) * 100))}
            @input=${(e: Event) => onChange({ tint: Number((e.target as HTMLInputElement).value) / 100 })}
          />
        </label>`
      : nothing}
    <label class="field">
      <span class="lbl range"><span>${t('core.editor.blur')}</span><span>${look.blur} px</span></span>
      <input
        type="range"
        min="8"
        max="60"
        .value=${String(look.blur)}
        @input=${(e: Event) => onChange({ blur: Number((e.target as HTMLInputElement).value) })}
      />
    </label>
    ${segField(
      t('core.editor.motion'),
      look.motion,
      [
        ['rich', t('core.editor.motionRich')],
        ['subtle', t('core.editor.motionSubtle')],
        ['minimal', t('core.editor.motionMinimal')],
      ],
      (motion) => onChange({ motion }),
    )}
    <span class="hint">${t('core.editor.reducedMotion')}</span>
  </div>`;
}

/**
 * A small (?) link to a docs section. The URL is `${docsUrl}/cards/${card}#${card}-${slug}`; the
 * accessible name says which section it opens (`sectionLabel` is the section's name).
 */
export function helpLink(docsUrl: string, card: string, slug: string, sectionLabel: string, t: EditorT): TemplateResult {
  const url = `${docsUrl}/cards/${card}#${card}-${slug}`;
  return html`<a class="help" href=${url} target="_blank" rel="noopener noreferrer" aria-label=${t('core.editor.help', { section: sectionLabel })}>?</a>`;
}

/** Fields, segmented controls, switches, help links and focus rings of an editor, on HA's own theme variables. */
export const editorStyles: CSSResultGroup = css`
  :host {
    display: block;
    color: var(--primary-text-color);
  }
  .tabrow {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--divider-color);
  }
  .tabs {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: 4px;
  }
  .tabs button {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 14px;
    border: none;
    background: none;
    color: var(--secondary-text-color);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    box-shadow: inset 0 -2px 0 transparent;
  }
  .tabs button.on {
    color: var(--primary-text-color);
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px 2px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary-text-color);
  }
  .lbl.range {
    display: flex;
    justify-content: space-between;
  }
  .look {
    display: contents;
  }
  .hint {
    font-size: 12px;
    color: var(--secondary-text-color);
  }
  input[type='text'],
  select {
    min-height: 40px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font: inherit;
    padding: 0 12px;
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 12px;
    border: 1px solid var(--divider-color);
  }
  .seg button {
    flex: 1;
    min-width: 0;
    padding: 0 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-height: 34px;
    border-radius: 9px;
    border: none;
    background: transparent;
    color: var(--secondary-text-color);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .sw {
    width: 42px;
    height: 26px;
    flex: none;
    border-radius: 13px;
    border: none;
    padding: 0;
    position: relative;
    cursor: pointer;
    background: var(--divider-color);
    transition: background-color 0.25s;
  }
  .sw.on {
    background: var(--primary-color);
  }
  .sw:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .sw span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.25s;
  }
  .sw.on span {
    left: 19px;
  }
  .lblrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
  }
  .help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex: none;
    width: 44px;
    min-height: 44px;
    margin-left: auto;
    color: var(--secondary-text-color);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .help:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -4px;
    border-radius: 10px;
  }
  @media (prefers-reduced-motion: reduce) {
    .sw,
    .sw span {
      transition: none;
    }
  }
`;

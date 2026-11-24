import { LitElement, css, html, nothing, unsafeCSS, render, svg, type PropertyValues, type ReactiveController, type ReactiveControllerHost } from 'lit';
import { property, state } from 'lit/decorators.js';
import { resolveGlass } from './glass';
import { LIQUID_FONT_STACK } from './font';
import { glassTokens } from './glass-styles';
import { ICONS } from './icons';
import { openHistory } from './navigate';
import { coreT, type Vars } from './i18n';
import { THEME_VARS } from './tokens';
import type { HomeAssistant } from './types';

// Copied from Liquid Climate 0.11.1 (src/cards/shared/sheet.ts, commit 373b340), made generic.

/** The least a sheet needs of a card config: an entity, a name and the look options (glass `theme` and motion `rich` when absent). */
export interface SheetConfig {
  entity: string;
  name?: string;
  /** Opt-in history button in the header, next to Close: the entity whose history page it opens. Absent: no button. */
  historyEntityId?: string;
  look?: { glass?: 'theme' | 'dark' | 'light'; motion?: 'rich' | 'subtle' | 'minimal' };
}

/**
 * The card that opens a sheet with openFor(). While the sheet is open it follows the owner's `hass`, takes the owner's
 * theme variables (`--lc-radius`, `--lc-blur`) and closes when the owner leaves the page.
 */
export type SheetOwner = HTMLElement & { hass?: HomeAssistant } & Partial<Pick<ReactiveControllerHost, 'addController' | 'removeController'>>;

/**
 * A card in a modal sheet. A native <dialog> opened with showModal() sits in the top layer, so
 * transforms and backdrop filters on HA's own ancestors cannot clip it. The content only exists
 * while the sheet is open; closing it removes the content, which lets a card flush any change
 * still waiting in its write queue.
 *
 * Products subclass this, implement createContent() and register their own tag
 * (for example liquid-home-sheet); core registers nothing.
 * The open animation is removed by `prefers-reduced-motion: reduce` and by `look.motion: minimal`.
 */
export abstract class LiquidSheetBase<C extends SheetConfig = SheetConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _content?: HTMLElement;
  @state() private _config?: C;
  private _returnTo?: HTMLElement | null;
  private _unfollow?: () => void;

  /** Build the element to show for `config`. It gets its hass and config from applyConfig() and willUpdate(). */
  protected abstract createContent(config: C): HTMLElement;

  /** Hand `config` to the content, on open and whenever the owning card's config changes. Default: nothing. */
  protected applyConfig(_content: HTMLElement, _config: C): void {}

  /** A string of the core layer in the user's language. Products with their own layers override this. */
  protected tr(key: string, vars?: Vars): string {
    return coreT(this.hass, key, vars);
  }

  get isOpen(): boolean {
    return !!this._content;
  }

  /** Open the sheet for `config`. Focus goes back to `returnTo` when the sheet closes. */
  async open(config: C, returnTo?: HTMLElement | null): Promise<void> {
    if (!this.hass || this._content) return;
    // A dialog left open without being modal (shown some other way) must close before showModal.
    const stale = this._dialog();
    if (stale?.open && !isModal(stale)) stale.close();
    const content = this.createContent(config);
    this.applyConfig(content, config);
    (content as HTMLElement & { hass?: HomeAssistant }).hass = this.hass;
    this._renderActions(content, config);
    this._returnTo = returnTo;
    this._config = config;
    this._content = content;
    await this.updateComplete;
    const dialog = this._dialog();
    if (dialog && !dialog.open) dialog.showModal();
    // The dialog would focus the first focusable in the composed tree, usually a power button,
    // where Enter right after opening would switch the device. Start on Close instead.
    await (content as { updateComplete?: Promise<unknown> }).updateComplete;
    if (this._content === content) content.querySelector<HTMLButtonElement>('button.close')?.focus();
  }

  /** The header buttons live in the content's own header (slot "header-action"), inside the glass: history (opt-in), then Close. */
  private _renderActions(content: HTMLElement, config: C): void {
    const id = config.historyEntityId;
    const history = id
      ? html`<button class="history" slot="header-action" aria-label=${this.tr('core.history')} @click=${() => this._openHistory(id)}>
          ${svg`<svg class="i" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d=${ICONS.history}></path></svg>`}
        </button>`
      : nothing;
    const close = html`<button class="close" slot="header-action" aria-label=${this.tr('core.close')} autofocus @click=${() => this.close()}>
      ${svg`<svg class="i" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d=${ICONS.close}></path></svg>`}
    </button>`;
    render([history, close], content);
  }

  /** Close first (removing the content), then navigate: the id is already captured and the event goes to window. */
  private _openHistory(entityId: string): void {
    this.close();
    openHistory(this, entityId);
  }

  /** The owning card's config changed: the open content follows it. */
  reconfigure(config: C): void {
    if (!this._content) return;
    this._config = config;
    this._renderActions(this._content, config);
    this.applyConfig(this._content, config);
  }

  close(): void {
    const dialog = this._dialog();
    if (dialog?.open) dialog.close();
    // Remove the content now: the close event may arrive later, or not at all on some paths.
    this._closed();
  }

  private _dialog(): HTMLDialogElement | null {
    return this.renderRoot?.querySelector('dialog') ?? null;
  }

  /**
   * Open the sheet for the card `owner`: it starts with the owner's hass, follows it while open (once per animation
   * frame, by reference, and at once through pushHass()), takes the owner's theme variables (D-3) and closes when the
   * owner is removed. Focus goes back to `returnTo`, by default the owner.
   */
  async openFor(owner: SheetOwner, config: C, returnTo: HTMLElement | null = owner): Promise<void> {
    if (this._content) return;
    if (owner.hass) this.hass = owner.hass;
    const before = this._content;
    // open() sets the content before its first await, so this is the content this call created (if any).
    const opening = this.open(config, returnTo);
    const mine = this._content !== before ? this._content : undefined;
    await opening;
    // Follow only that content: a close and another open may have run while this call awaited.
    if (!mine || this._content !== mine) return;
    this._unfollow?.();
    this._unfollow = this._follow(owner);
  }

  /** An owner that skips updates (a render gate in shouldUpdate) can hand each new hass on here. */
  pushHass(hass: HomeAssistant | undefined): void {
    if (this._content && hass && hass !== this.hass) this.hass = hass;
  }

  /** Follow `owner` while open; returns the function that stops following. */
  private _follow(owner: SheetOwner): () => void {
    // Theme variables set on (or inherited by) the owner reach the sheet, which sits in the top layer elsewhere.
    // Only what this follower sets is undone later; an inline value the sheet host had before comes back.
    const style = getComputedStyle(owner);
    const set: { name: string; before: string; priority: string }[] = [];
    for (const name of [THEME_VARS.radius, THEME_VARS.blur]) {
      const value = style.getPropertyValue(name).trim();
      if (!value) continue;
      set.push({ name, before: this.style.getPropertyValue(name), priority: this.style.getPropertyPriority(name) });
      this.style.setProperty(name, value);
    }
    // Removed, not moved: HA re-parents cards synchronously (masonry relayout, edit mode), so decide after the
    // current task step, when a move has put the owner back on the page.
    const gone = () =>
      queueMicrotask(() => {
        if (!owner.isConnected) this.close();
      });
    let frame = 0;
    const tick = () => {
      if (owner.isConnected) this.pushHass(owner.hass);
      else gone();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A Lit owner also says when it leaves, without waiting for the next frame.
    const ctrl: ReactiveController = { hostDisconnected: gone };
    owner.addController?.(ctrl);
    return () => {
      cancelAnimationFrame(frame);
      owner.removeController?.(ctrl);
      for (const v of set) {
        if (v.before) this.style.setProperty(v.name, v.before, v.priority);
        else this.style.removeProperty(v.name);
      }
    };
  }

  private _closed = () => {
    if (!this._content) return;
    this._unfollow?.();
    this._unfollow = undefined;
    this._content = undefined;
    const to = this._returnTo;
    this._returnTo = undefined;
    to?.focus();
  };

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('hass') && this._content && this.hass) (this._content as HTMLElement & { hass?: HomeAssistant }).hass = this.hass;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Removed while open: close the dialog so the next open() starts modal, and focus nowhere.
    this._returnTo = undefined;
    const dialog = this._dialog();
    if (dialog?.open) dialog.close();
    this._unfollow?.();
    this._unfollow = undefined;
    this._content = undefined;
  }

  private _onCancel = (e: Event) => {
    // Escape: close through the same path as the button so focus returns.
    e.preventDefault();
    this.close();
  };

  private _onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };

  /** A click that lands on the dialog itself, not its content, is a click on the backdrop. */
  private _onClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) this.close();
  };

  protected override render() {
    const cfg = this._config;
    const glass = cfg && this.hass ? resolveGlass(cfg.look?.glass ?? 'theme', this.hass, this) : 'dark';
    const name = cfg?.name || (cfg && this.hass?.states[cfg.entity]?.attributes.friendly_name) || cfg?.entity || '';
    return html`<dialog
      class="g-${glass} m-${cfg?.look?.motion ?? 'rich'}"
      aria-label=${name}
      @cancel=${this._onCancel}
      @close=${this._closed}
      @keydown=${this._onKey}
      @click=${this._onClick}
    >
      ${this._content ? html`<div class="frame">${this._content}</div>` : nothing}
    </dialog>`;
  }

  static override styles = [
    glassTokens,
    css`
      :host {
        display: contents;
      }
      dialog {
        box-sizing: border-box;
        width: min(444px, calc(100vw - 24px));
        max-width: none;
        max-height: calc(100dvh - 24px);
        margin: auto;
        /* Only the content's rounded glass shows: the dialog box itself paints nothing. */
        padding: 0;
        border: none;
        outline: none;
        box-shadow: none;
        background: transparent;
        color: var(--lc-fg);
        font-family: ${unsafeCSS(LIQUID_FONT_STACK)};
        overflow: auto;
        overscroll-behavior: contain;
      }
      dialog:focus,
      dialog:focus-visible {
        outline: none;
      }
      /* The dialog clips its overflow, so the card's drop shadow would show as a square. */
      .frame > * {
        --lc-drop: 0 0 0 transparent;
      }
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      @media (prefers-reduced-transparency: reduce) {
        dialog::backdrop {
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
      }
      dialog[open] {
        animation: lcSheetIn 0.32s cubic-bezier(0.3, 1.3, 0.5, 1);
      }
      dialog.m-minimal[open] {
        animation: none;
      }
      @keyframes lcSheetIn {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      .frame {
        display: block;
      }
      /* Slotted into the card header: it inherits the card's glass tokens, like its power button. */
      .close,
      .history {
        width: 44px;
        height: 44px;
        flex: none;
        margin: 0;
        padding: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font: inherit;
        color: var(--lc-fg);
        cursor: pointer;
        background: var(--lc-btn);
        border: 1px solid var(--lc-btn-edge);
      }
      .close:focus-visible,
      .history:focus-visible {
        outline: 2px solid var(--lc-bright);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        dialog[open] {
          animation: none;
        }
      }
    `,
  ];
}

function isModal(d: HTMLDialogElement): boolean {
  try {
    return d.matches(':modal');
  } catch {
    // Engines without :modal: treat as not modal, so the dialog is reopened modal.
    return false;
  }
}

import { css, unsafeCSS } from 'lit';
import { LIQUID_FONT_STACK } from './font';
import { ROOM_FILL } from './glass';
import { DISABLED_OPACITY, THEME_VARS, UNAVAILABLE_POWER_OPACITY } from './tokens';

/**
 * Card chrome copied from Liquid Climate 0.11.1 (commit 373b340): the generic rules of the dial card, the tile, the
 * badge and the cluster card, so every product draws the same glass card, header, buttons, chips and type scale.
 * Climate-only rules (the arc dial and its parts, range pills, flicker, attention dot, mini dial, figures, floors) are
 * not here. test/chrome.test.ts parses every rule below and compares its declarations with the same rule in the
 * Liquid Climate source (test/fixtures/lc-0.11.1-tokens.json, written by scripts/parity-fixture.mjs). The one
 * difference is the font stack: core puts its own 'Liquid Inter' face (font.ts) before Liquid Climate's stack.
 *
 * The named values below are interpolated into the stylesheets; `src/...:N` is the Liquid Climate source line.
 * Products add glassTokens and focusRing next to a chrome stylesheet; the chrome itself has no focus rule.
 */

/** The dial-family card (src/cards/dial/styles.ts). */
export const DIAL = {
  /** :host --lc-radius-default, styles.ts:11. */
  radius: 40,
  /** .lc, styles.ts:20. */
  maxWidth: 444,
  /** .lc, styles.ts:22. */
  padding: 22,
  /** .lc, styles.ts:34. */
  gap: 16,
  /** .lc backdrop saturate, styles.ts:26. */
  saturate: 170,
  /** .lc --lc-drop fallback, styles.ts:31. */
  shadow: '0 40px 80px -24px rgba(0, 0, 0, 0.45)',
  /** h2, styles.ts:66 to 68. */
  title: { size: 20, weight: 600, letterSpacing: '-0.02em' },
  /** header .sub, styles.ts:111. */
  sub: 13,
  /** .power, styles.ts:125 to 126. */
  power: 44,
  /** .chip, .chip .k, .chip .v, styles.ts:393, 394, 409, 416. */
  chip: { height: 52, radius: 16, key: 11, value: 13 },
  /** .alert, styles.ts:484 and 488. */
  alert: { radius: 14, size: 13 },
} as const;

/** The tile (src/cards/tile/liquid-climate-tile.ts). */
export const TILE = {
  /** .tile, liquid-climate-tile.ts:262. */
  height: 96,
  /** .tile --lc-radius fallback, liquid-climate-tile.ts:267. */
  radius: 26,
  /** .tile --_blur fallback (the look.blur default), liquid-climate-tile.ts:270. */
  blur: 30,
  saturate: 170,
  /** .tile, liquid-climate-tile.ts:275. */
  shadow: '0 20px 40px -20px rgba(0, 0, 0, 0.6)',
  /** .power, liquid-climate-tile.ts:302 and 305. */
  power: { size: 50, radius: 16 },
  /** .body, liquid-climate-tile.ts:324. */
  bodyRadius: 8,
  /** .name, liquid-climate-tile.ts:327 to 329. */
  name: { size: 16, weight: 600, letterSpacing: '-0.01em' },
  /** .sub, liquid-climate-tile.ts:335. */
  sub: 13,
  /** .target, liquid-climate-tile.ts:376 to 378. */
  value: { size: 24, weight: 300, letterSpacing: '-0.03em' },
  /** .step, round, liquid-climate-tile.ts:362 to 363. */
  step: 44,
} as const;

/** The badge, sized through HA's own badge theme tokens (src/cards/badge/liquid-climate-badge.ts). */
export const BADGE = {
  /** --ha-badge-size fallback; the radius is half of it. liquid-climate-badge.ts:189. */
  size: 36,
  /** --_blur fallback, liquid-climate-badge.ts:203. */
  blur: 22,
  saturate: 180,
  /** liquid-climate-badge.ts:209. */
  shadow: '0 12px 28px -14px rgba(0, 0, 0, 0.6)',
  /** .pill, liquid-climate-badge.ts:221 to 222 (gap: --ha-space-2 fallback). */
  padding: 12,
  gap: 8,
  /** .ic svg (--ha-badge-icon-size fallback), liquid-climate-badge.ts:237. */
  icon: 18,
  /** .pill .ic: the tinted circle sits this far inside the badge edge (28 at the default size), liquid-climate-badge.ts:242. */
  circleInset: 4,
  /** .n and .v font fallbacks (--ha-font-size-xs, --ha-font-size-s), liquid-climate-badge.ts:253 and 263. */
  name: 10,
  value: 12,
} as const;

/** The cluster card (src/cards/cluster/liquid-climate-cluster.ts). */
export const CLUSTER = {
  /** .cluster --lc-radius fallback, liquid-climate-cluster.ts:472. */
  radius: 36,
  /** .cluster padding narrow, from 440px and from 720px of container width, liquid-climate-cluster.ts:468, 841, 868. */
  padding: { narrow: 16, medium: 20, wide: 24 },
  /** .cluster gap, narrow and wide, liquid-climate-cluster.ts:471, 869. */
  gap: { narrow: 14, wide: 18 },
  blur: 30,
  saturate: 170,
  /** liquid-climate-cluster.ts:480. */
  shadow: '0 40px 80px -24px rgba(0, 0, 0, 0.65)',
  /** h2, liquid-climate-cluster.ts:521. */
  title: 22,
  /** .room radius narrow and from 440px, liquid-climate-cluster.ts:569, 852. */
  room: { radius: 22, radiusMedium: 26 },
  /** .big value narrow, 440px, 720px, liquid-climate-cluster.ts:670, 856, 878. */
  value: { narrow: 34, medium: 40, wide: 44 },
  /** .mode and .step, liquid-climate-cluster.ts:784, 799. */
  control: 44,
} as const;

/** Icon size and stroke width per use in the cluster card (liquid-climate-cluster.ts:300, 342, 361, 382, 393). */
export const CLUSTER_ICON = {
  room: { size: 16, stroke: 2 },
  chevron: { size: 16, stroke: 2 },
  mode: { size: 18, stroke: 1.9 },
  step: { size: 18, stroke: 2 },
} as const;

/** The disclosure chevron of the cluster strip (liquid-climate-cluster.ts:28). Kept out of ICONS on purpose. */
export const CHEVRON = 'M9 6l6 6-6 6';

const RADIUS = unsafeCSS(THEME_VARS.radius);
const BLUR = unsafeCSS(THEME_VARS.blur);
const FONT = unsafeCSS(LIQUID_FONT_STACK);

/**
 * Dial-family card chrome: the glass card `.lc`, header, power, mode buttons, chips, alert, unavailable text.
 * `.lc` blurs with `var(--lc-blur, var(--_blur))` and has no fallback of its own (parity with Liquid Climate), so the
 * card must set `--_blur` inline on the `.lc` element from its look.blur, as Liquid Climate does
 * (`style=${styleMap({ '--_blur': `${look.blur}px` })}`, src/cards/dial/liquid-climate-card.ts:461 and 466).
 */
export const dialChrome = css`
  :host {
    display: block;
    --lc-radius-default: ${DIAL.radius}px;
  }

  .lc {
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1;
    position: relative;
    box-sizing: border-box;
    max-width: ${DIAL.maxWidth}px;
    margin: 0 auto;
    padding: ${DIAL.padding}px;
    border-radius: var(${RADIUS}, var(--lc-radius-default));
    color: var(--lc-fg);
    background: var(--lc-bg);
    backdrop-filter: blur(var(${BLUR}, var(--_blur))) saturate(${DIAL.saturate}%);
    -webkit-backdrop-filter: blur(var(${BLUR}, var(--_blur))) saturate(${DIAL.saturate}%);
    border: 1px solid var(--lc-edge);
    box-shadow:
      inset 0 1px 0 var(--lc-shine),
      var(--lc-drop, ${unsafeCSS(DIAL.shadow)});
    display: flex;
    flex-direction: column;
    gap: ${DIAL.gap}px;
    overflow: hidden;
  }

  h2 {
    margin: 0;
    font-size: ${DIAL.title.size}px;
    font-weight: ${DIAL.title.weight};
    letter-spacing: ${unsafeCSS(DIAL.title.letterSpacing)};
  }

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    margin: 0;
    border: 1px solid var(--lc-btn-edge);
    background: var(--lc-btn);
  }
  button:disabled {
    cursor: default;
  }
  .press {
    transition:
      transform 0.28s cubic-bezier(0.3, 1.7, 0.5, 1),
      background-color 0.5s ease,
      border-color 0.5s ease;
  }
  .press:active:not(:disabled) {
    transform: scale(0.93);
  }

  header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  header .titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  header .sub {
    font-size: ${DIAL.sub}px;
    color: var(--lc-fg2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  header .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .power {
    width: ${DIAL.power}px;
    height: ${DIAL.power}px;
    flex: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .modes {
    position: relative;
    display: grid;
    gap: 6px;
  }
  .mode {
    height: 60px;
    border-radius: 18px;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
  }
  .mode span {
    font-size: 11px;
    font-weight: 500;
    max-width: 100%;
    min-width: 0;
    padding: 0 2px;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips {
    position: relative;
    display: grid;
    gap: 6px;
  }
  .chip {
    height: ${DIAL.chip.height}px;
    border-radius: ${DIAL.chip.radius}px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    min-width: 0;
  }
  .chip .txt {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .chip .k {
    font-size: ${DIAL.chip.key}px;
    color: var(--lc-fg3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip .v {
    font-size: ${DIAL.chip.value}px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip svg {
    flex: none;
    opacity: 0.85;
  }

  .alert {
    position: relative;
    border-radius: ${DIAL.alert.radius}px;
    background: rgba(248, 113, 113, 0.16);
    border: 1px solid rgba(248, 113, 113, 0.45);
    padding: 9px 12px;
    font-size: ${DIAL.alert.size}px;
  }

  .unavailable {
    padding: 24px;
    text-align: center;
    color: var(--lc-fg2);
  }

  @media (prefers-reduced-motion: reduce) {
    .press {
      transition: none;
    }
  }
`;

/** Tile chrome: the 96px glass row, power button, name and status, round steps and the value between them. */
export const tileChrome = css`
  :host {
    display: block;
  }
  .tile {
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1;
    position: relative;
    box-sizing: border-box;
    height: ${TILE.height}px;
    padding: 0 12px 0 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    border-radius: var(${RADIUS}, ${TILE.radius}px);
    color: var(--lc-fg);
    background: var(--lc-bg);
    backdrop-filter: blur(var(${BLUR}, var(--_blur, ${TILE.blur}px))) saturate(${TILE.saturate}%);
    -webkit-backdrop-filter: blur(var(${BLUR}, var(--_blur, ${TILE.blur}px))) saturate(${TILE.saturate}%);
    border: 1px solid var(--lc-edge);
    box-shadow:
      inset 0 1px 0 var(--lc-shine),
      ${unsafeCSS(TILE.shadow)};
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    margin: 0;
    border: 1px solid var(--lc-btn-edge);
    background: var(--lc-btn);
  }
  button:disabled {
    cursor: default;
  }
  .press {
    transition:
      transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1),
      background-color 0.5s ease,
      border-color 0.5s ease;
  }
  .press:active:not(:disabled) {
    transform: scale(0.9);
  }
  .power {
    width: ${TILE.power.size}px;
    height: ${TILE.power.size}px;
    flex: none;
    border-radius: ${TILE.power.radius}px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .power:disabled {
    opacity: ${UNAVAILABLE_POWER_OPACITY};
  }
  .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    border-radius: ${TILE.bodyRadius}px;
  }
  .name {
    font-size: ${TILE.name.size}px;
    font-weight: ${TILE.name.weight};
    letter-spacing: ${unsafeCSS(TILE.name.letterSpacing)};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: ${TILE.sub}px;
    color: var(--lc-fg2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub.err {
    color: var(--lc-warn);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .steps {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .step {
    width: ${TILE.step}px;
    height: ${TILE.step}px;
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .step:disabled {
    opacity: ${DISABLED_OPACITY};
  }
  .target {
    width: 64px;
    text-align: center;
    font-size: ${TILE.value.size}px;
    font-weight: ${TILE.value.weight};
    letter-spacing: ${unsafeCSS(TILE.value.letterSpacing)};
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .press {
      transition: none;
    }
  }
`;

/** Badge chrome: HA badge sizes through its theme tokens, pill and round shapes, icon circle, name and value. */
export const badgeChrome = css`
  :host {
    display: inline-block;
    max-width: 100%;
  }
  .wrap {
    display: contents;
  }
  /* Sizes follow HA's own badge (ha-badge), through its theme tokens. */
  .badge {
    --_size: var(--ha-badge-size, ${BADGE.size}px);
    font: inherit;
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1;
    position: relative;
    box-sizing: border-box;
    height: var(--_size);
    min-width: var(--_size);
    margin: 0;
    display: flex;
    align-items: center;
    color: var(--lc-fg);
    background-color: var(--lc-bg);
    backdrop-filter: blur(var(${BLUR}, var(--_blur, ${BADGE.blur}px))) saturate(${BADGE.saturate}%);
    -webkit-backdrop-filter: blur(var(${BLUR}, var(--_blur, ${BADGE.blur}px))) saturate(${BADGE.saturate}%);
    border: 1px solid var(--lc-edge);
    border-radius: var(--ha-badge-border-radius, calc(var(--ha-badge-size, ${BADGE.size}px) / 2));
    box-shadow:
      inset 0 1px 0 var(--lc-shine),
      ${unsafeCSS(BADGE.shadow)};
    text-align: left;
  }
  button.badge {
    cursor: pointer;
  }
  .pill {
    max-width: 100%;
    padding: 0 ${BADGE.padding}px;
    gap: var(--ha-space-2, ${BADGE.gap}px);
  }
  .round {
    width: var(--_size);
    padding: 0;
    justify-content: center;
  }
  .ic {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--lc-bright);
  }
  .ic svg {
    width: var(--ha-badge-icon-size, ${BADGE.icon}px);
    height: var(--ha-badge-icon-size, ${BADGE.icon}px);
  }
  /* The tinted circle sits 4px inside the badge edge, like HA pulls its icon in. */
  .pill .ic {
    width: calc(var(--_size) - ${2 * BADGE.circleInset}px);
    height: calc(var(--_size) - ${2 * BADGE.circleInset}px);
    margin-inline-start: -8px;
    border-radius: 50%;
  }
  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .n {
    font-size: var(--ha-font-size-xs, ${BADGE.name}px);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: 10px;
    letter-spacing: 0.1px;
    color: var(--lc-fg2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v {
    font-size: var(--ha-badge-font-size, var(--ha-font-size-s, ${BADGE.value}px));
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: var(--ha-line-height-condensed, 1.2);
    letter-spacing: 0.1px;
    white-space: nowrap;
  }
`;

/**
 * Room layout of the room card (CHO-12): the value block of a room tile. Not a Liquid Climate value: it is the
 * `.room .rv` rule of the gate 2 approved prototype (lh-proto/index.html:119 in the Liquid Home design archive).
 */
export const clusterRoomLayout = css`
  .room .rv {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 22px 0 18px;
  }
`;

/**
 * Cluster chrome: the glass card, room fills, header, the scrolling or gridded rooms, room tiles, the value type scale
 * per container width, and the strip (name, modes, steps). `clusterStyles` is the same stylesheet.
 */
export const clusterChrome = css`
  :host {
    display: block;
    container-type: inline-size;
  }
  .g-dark {
    --lc-room: ${unsafeCSS(ROOM_FILL.dark.rest)};
    --lc-room-on: ${unsafeCSS(ROOM_FILL.dark.on)};
    --lc-room-edge: ${unsafeCSS(ROOM_FILL.dark.edge)};
    --lc-room-on-edge: ${unsafeCSS(ROOM_FILL.dark.onEdge)};
  }
  .g-light {
    --lc-room: ${unsafeCSS(ROOM_FILL.light.rest)};
    --lc-room-on: ${unsafeCSS(ROOM_FILL.light.on)};
    --lc-room-edge: ${unsafeCSS(ROOM_FILL.light.edge)};
    --lc-room-on-edge: ${unsafeCSS(ROOM_FILL.light.onEdge)};
  }
  .cluster {
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
    font-feature-settings: 'tnum' 1;
    position: relative;
    box-sizing: border-box;
    padding: ${CLUSTER.padding.narrow}px;
    display: flex;
    flex-direction: column;
    gap: ${CLUSTER.gap.narrow}px;
    border-radius: var(${RADIUS}, ${CLUSTER.radius}px);
    color: var(--lc-fg);
    background: var(--lc-bg);
    backdrop-filter: blur(var(${BLUR}, var(--_blur, ${CLUSTER.blur}px))) saturate(${CLUSTER.saturate}%);
    -webkit-backdrop-filter: blur(var(${BLUR}, var(--_blur, ${CLUSTER.blur}px))) saturate(${CLUSTER.saturate}%);
    border: 1px solid var(--lc-edge);
    box-shadow:
      inset 0 1px 0 var(--lc-shine),
      ${unsafeCSS(CLUSTER.shadow)};
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    margin: 0;
    border: 1px solid var(--lc-btn-edge);
    background: var(--lc-btn);
  }
  button:disabled {
    cursor: default;
  }
  .press {
    transition:
      transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1),
      background-color 0.5s ease,
      border-color 0.5s ease;
  }
  .press:active:not(:disabled):not([aria-disabled='true']) {
    transform: scale(0.96);
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 16px;
    flex-wrap: wrap;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: ${CLUSTER.title}px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .sum {
    font-size: 13px;
    color: var(--lc-fg2);
  }
  /* Narrow: compact rooms in a horizontal scroller. The vertical padding keeps focus rings unclipped. */
  .rooms {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    margin: -6px -16px;
    padding: 6px 16px;
    scroll-padding: 0 16px;
  }
  .rooms::-webkit-scrollbar {
    display: none;
  }
  .room {
    /* The next room peeks in, so the row reads as scrollable. */
    flex: 0 0 min(158px, 42cqw);
    scroll-snap-align: start;
    box-sizing: border-box;
    min-width: 0;
    border-radius: ${CLUSTER.room.radius}px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    text-align: left;
    background: var(--lc-room);
    border-color: var(--lc-room-edge);
  }
  .room.sel {
    background: var(--lc-room-on);
    border-color: var(--lc-room-on-edge);
  }
  .rhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .rname {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ricon {
    display: flex;
    flex: none;
  }
  .tline {
    display: flex;
    align-items: flex-start;
  }
  .big {
    font-size: ${CLUSTER.value.narrow}px;
    font-weight: 200;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .deg {
    font-size: 15px;
    font-weight: 300;
    margin-top: 3px;
    color: var(--lc-fg2);
  }
  .foot {
    font-size: 12px;
    color: var(--lc-fg3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .foot.warn,
  .sverb.warn {
    color: var(--lc-warn);
  }
  /* Error codes stay visible: up to two lines instead of an ellipsis. */
  .foot.warn {
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .empty {
    margin: 0;
    font-size: 13px;
    color: var(--lc-fg2);
  }
  /* Name and steppers on one row, the modes below; from 720px all on one row (see below). */
  .strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'who steps' 'modes modes';
    align-items: center;
    gap: 12px 16px;
    border-top: 1px solid var(--lc-line);
    padding-top: 14px;
  }
  .strip.nomodes {
    grid-template-areas: 'who steps';
  }
  .who {
    grid-area: who;
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    margin-left: -8px;
    border: none;
    background: none;
    text-align: left;
    border-radius: 12px;
    transition: background-color 0.3s ease;
  }
  .who:hover,
  .who:focus-visible {
    background: var(--lc-btn);
  }
  .wtext {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .chev {
    display: flex;
    flex: none;
    color: var(--lc-fg2);
  }
  .sname {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sverb {
    font-size: 12px;
    color: var(--lc-fg3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .modes {
    grid-area: modes;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mode {
    width: ${CLUSTER.control}px;
    height: ${CLUSTER.control}px;
    border-radius: 14px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .steps {
    grid-area: steps;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .step {
    width: ${CLUSTER.control}px;
    height: ${CLUSTER.control}px;
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* aria-disabled, not disabled: the button keeps focus and the click is ignored. */
  .step[aria-disabled='true'] {
    opacity: ${DISABLED_OPACITY};
    cursor: default;
  }
  .target {
    width: 66px;
    text-align: center;
    font-size: 24px;
    font-weight: 300;
    letter-spacing: -0.03em;
    white-space: nowrap;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  /* Medium: two columns of full rooms. */
  @container (min-width: 440px) {
    .cluster {
      padding: ${CLUSTER.padding.medium}px;
    }
    .rooms {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      overflow: visible;
      margin: 0;
      padding: 0;
    }
    .room {
      border-radius: ${CLUSTER.room.radiusMedium}px;
      padding: 14px;
    }
    .big {
      font-size: ${CLUSTER.value.medium}px;
    }
    .deg {
      font-size: 17px;
    }
  }
  /* Wide: three columns, the strip on one row like the board; many modes wrap inside their cell. */
  @container (min-width: 720px) {
    .cluster {
      padding: ${CLUSTER.padding.wide}px;
      gap: ${CLUSTER.gap.wide}px;
    }
    .rooms {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .room {
      padding: 16px;
    }
    .big {
      font-size: ${CLUSTER.value.wide}px;
    }
    .deg {
      font-size: 18px;
      margin-top: 4px;
    }
    .strip,
    .strip.nomodes {
      grid-template-columns: minmax(96px, 150px) minmax(0, 1fr) auto;
      grid-template-areas: 'who modes steps';
      padding-top: 16px;
    }
    .steps {
      gap: 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .press,
    .who {
      transition: none;
    }
  }
  ${clusterRoomLayout}
`;

/** The name the room card builders use for the cluster chrome. */
export const clusterStyles = clusterChrome;

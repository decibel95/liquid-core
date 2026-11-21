import { css, unsafeCSS } from 'lit';
import { GLASS, MENU_GLASS } from './glass';

/**
 * Glass palette tokens (.g-dark, .g-light), the light rim and the line icon style.
 * Shared by every card so they all follow look.glass the same way.
 */
export const glassTokens = css`
  .g-dark {
    --lc-fg: ${unsafeCSS(GLASS.dark.fg)};
    --lc-fg2: ${unsafeCSS(GLASS.dark.fg2)};
    --lc-fg3: ${unsafeCSS(GLASS.dark.fg3)};
    --lc-bg: ${unsafeCSS(GLASS.dark.bg)};
    --lc-warn: ${unsafeCSS(GLASS.dark.warn)};
    --lc-edge: rgba(255, 255, 255, 0.12);
    --lc-shine: rgba(255, 255, 255, 0.22);
    --lc-track: ${unsafeCSS(GLASS.dark.track)};
    --lc-tick: ${unsafeCSS(GLASS.dark.tick)};
    --lc-bright: ${unsafeCSS(GLASS.dark.bright)};
    --lc-btn: rgba(255, 255, 255, 0.05);
    --lc-btn-edge: rgba(255, 255, 255, 0.08);
    --lc-btn-on: rgba(255, 255, 255, 0.14);
    --lc-btn-on-edge: rgba(255, 255, 255, 0.28);
    --lc-line: rgba(255, 255, 255, 0.09);
    --lc-line2: rgba(255, 255, 255, 0.06);
    --lc-rim: rgba(255, 255, 255, 0.5);
    --lc-rim2: rgba(255, 255, 255, 0.18);
    --lc-glow: rgba(255, 255, 255, 0.09);
    --lc-menu-fg2: ${unsafeCSS(MENU_GLASS.dark.fg2)};
    --lc-menu-warn: ${unsafeCSS(MENU_GLASS.dark.warn)};
    --lc-menu-panel: ${unsafeCSS(MENU_GLASS.dark.panel)};
    --lc-menu-head: ${unsafeCSS(MENU_GLASS.dark.head)};
    --lc-menu-edge: ${unsafeCSS(MENU_GLASS.dark.edge)};
    --lc-menu-on-track: ${unsafeCSS(MENU_GLASS.dark.onTrack)};
    --lc-menu-on-thumb: ${unsafeCSS(MENU_GLASS.dark.onThumb)};
    --lc-menu-off-track: ${unsafeCSS(MENU_GLASS.dark.offTrack)};
    --lc-menu-off-thumb: ${unsafeCSS(MENU_GLASS.dark.offThumb)};
    --lc-menu-hover: ${unsafeCSS(MENU_GLASS.dark.hover)};
    --lc-menu-pill: ${unsafeCSS(MENU_GLASS.dark.pill)};
    --lc-menu-pill-on: ${unsafeCSS(MENU_GLASS.dark.pillOn)};
  }
  .g-light {
    --lc-fg: ${unsafeCSS(GLASS.light.fg)};
    --lc-fg2: ${unsafeCSS(GLASS.light.fg2)};
    --lc-fg3: ${unsafeCSS(GLASS.light.fg3)};
    --lc-bg: ${unsafeCSS(GLASS.light.bg)};
    --lc-warn: ${unsafeCSS(GLASS.light.warn)};
    --lc-edge: rgba(0, 0, 0, 0.1);
    --lc-shine: rgba(255, 255, 255, 0.7);
    --lc-track: ${unsafeCSS(GLASS.light.track)};
    --lc-tick: ${unsafeCSS(GLASS.light.tick)};
    --lc-bright: ${unsafeCSS(GLASS.light.bright)};
    --lc-btn: rgba(0, 0, 0, 0.04);
    --lc-btn-edge: rgba(0, 0, 0, 0.08);
    --lc-btn-on: rgba(0, 0, 0, 0.1);
    --lc-btn-on-edge: rgba(0, 0, 0, 0.24);
    --lc-line: rgba(0, 0, 0, 0.1);
    --lc-line2: rgba(0, 0, 0, 0.06);
    --lc-rim: rgba(255, 255, 255, 0.9);
    --lc-rim2: rgba(255, 255, 255, 0.4);
    --lc-glow: rgba(255, 255, 255, 0.4);
    --lc-menu-fg2: ${unsafeCSS(MENU_GLASS.light.fg2)};
    --lc-menu-warn: ${unsafeCSS(MENU_GLASS.light.warn)};
    --lc-menu-panel: ${unsafeCSS(MENU_GLASS.light.panel)};
    --lc-menu-head: ${unsafeCSS(MENU_GLASS.light.head)};
    --lc-menu-edge: ${unsafeCSS(MENU_GLASS.light.edge)};
    --lc-menu-on-track: ${unsafeCSS(MENU_GLASS.light.onTrack)};
    --lc-menu-on-thumb: ${unsafeCSS(MENU_GLASS.light.onThumb)};
    --lc-menu-off-track: ${unsafeCSS(MENU_GLASS.light.offTrack)};
    --lc-menu-off-thumb: ${unsafeCSS(MENU_GLASS.light.offThumb)};
    --lc-menu-hover: ${unsafeCSS(MENU_GLASS.light.hover)};
    --lc-menu-pill: ${unsafeCSS(MENU_GLASS.light.pill)};
    --lc-menu-pill-on: ${unsafeCSS(MENU_GLASS.light.pillOn)};
  }
  .rim::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(140deg, var(--lc-rim), transparent 35%, transparent 65%, var(--lc-rim2));
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) content-box exclude,
      linear-gradient(#000 0 0);
    pointer-events: none;
  }
  svg.i {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;

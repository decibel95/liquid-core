import { css, unsafeCSS } from 'lit';
import { FOCUS } from './tokens';

/**
 * The focus ring (TOK-19): 2px lc-bright, offset 2px on buttons and 3px on sliders, shown only for
 * keyboard focus (`:focus-visible`). It is an outline outside the control, so it never looks like the
 * selected state of a mode button (a 0.20 / 0.45 tint inside the button, TOK-22). Cards add this
 * stylesheet once; the slider frame carries `lc-slider`, so its ring sits 3px out in both variants.
 */
export const focusRing = css`
  button:focus-visible,
  a:focus-visible,
  select:focus-visible,
  input:focus-visible,
  [role='button']:focus-visible,
  [role='switch']:focus-visible,
  [role='slider']:focus-visible {
    outline: ${FOCUS.width}px solid ${unsafeCSS(FOCUS.color)};
    outline-offset: ${FOCUS.offset}px;
  }
  [role='slider']:focus-visible,
  .lc-slider:focus-visible {
    outline-offset: ${FOCUS.sliderOffset}px;
  }
  :focus:not(:focus-visible) {
    outline: none;
  }
`;

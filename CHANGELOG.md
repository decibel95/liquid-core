# Changelog

All notable changes to liquid-core. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

While liquid-core is 0.x, a minor bump marks any visual change (a token value, a style, an icon path) or an API break, and a patch bump marks non-visual fixes only. Every visual change is listed under `### Changed` with the token name and the old and new value.

<!-- #region entries -->
## 0.5.0

The 0.5.0 changes: the artwork backdrop, a horizontal and a read-only slider, eight media icons, a header slot and two hooks in the sheet, and the menu rows. Nothing existing changes visually.

### Added
- Artwork backdrop for media cards: `ArtworkController` (one per host element; `set(url)` from `willUpdate`, loads only while the host is in view, decodes a new cover before it is drawn and keeps the old one meanwhile, drops to plain glass on an empty URL, a decode error or no decode within `ART.decodeCap`), `renderArtwork(ctrl, { motion })` (the layer template, instant under reduced motion and `look.motion` minimal) and `artworkStyles` (the layer and scrim CSS).
- `ART.fade` (800, the crossfade in ms), `ART.decodeCap` (3000, the decode time limit in ms) and `ART.scrimLight` (the scrim of the light glass over a cover).
- `SliderView.orientation` (`'vertical'` default or `'horizontal'`; a horizontal slider is the full width of its container, fills from the start edge, which is the right edge in RTL, and has no knob), `SliderView.max` (the top of the range, default 100; drives `aria-valuemax`, drag scaling and Home and End), `SliderView.readOnly` (the same drawing as a `progressbar` with no focus, pointer or key handling) and `SliderView.ticker` (horizontal only: a value that changes without a drag moves the fill with a 1 s linear transition, as for a playing position).
- `SLIDER.horizontal` (height 44, radius 22) and `SLIDER.ticker` (1000 ms, linear).
- Icon keys in `ICONS`, Lucide 0.460.0 in the existing line style, appended after `moveDiagonal`: `speaker`, `play`, `pause`, `skipForward`, `volumeX`, `shuffle`, `repeat` and `repeat1`.
- `LiquidSheetBase.headerActions(config)`: protected, returns a template rendered in the sheet header before the history and close buttons. The default renders nothing, so a sheet that does not override it is unchanged.
- `LiquidSheetBase.requestActions()`: protected, re-renders the header buttons into the same nodes (focus stays) for a subclass whose header action state changes without a hass change. It does nothing while the sheet is closed.
- `LiquidSheetBase.onClosed()`: protected hook, called once each time the sheet finishes closing (Close, Escape, the backdrop, a native close of the dialog or removal while open), after the sheet has dropped its content (the element leaves the DOM on the next render). Focus has already gone back to `returnTo`, if any (not on removal). A subclass can release what it holds for the open sheet there. The default does nothing.
- Menu rows for a choice list drawn inside the card's glass, the same rows as the Liquid Climate sheet menu: `menuStyles` (`.mpanel`, `.mhead`, `.mgroup`, `.mitem` with hover and the selected pill on a `radio` or `menuitemradio` row, `.mlabel` on up to two lines, `.mcheck` shown only on the selected row, and the focus ring of the Liquid Climate menu, 2px inside the row), `MENU` (panel radius 16, padding 6, gap 6; head 12 / 600; rows 44 high, radius 12, 2 apart, text 13; check 16 with stroke 2.4) and `MENU_CHECK`, the check path of the selected row.

### Fixed
- The value from `SliderView.keyStep` is clamped to the range of the slider before it is previewed and written, so a step past the end can no longer set an out-of-range value.
- A sheet closed and opened again at once (for example for another entity) is no longer emptied by the close event of the first close, which the browser delivers after the dialog has opened again.
- A sheet closed while it is still opening no longer leaves an empty modal dialog open that blocks the page. `open()` now settles in that case, and removing the sheet while it is opening no longer rejects.

## 0.4.0

### Added
- Six line icons for covers and fans in `ICONS`, all Lucide 0.460.0 in the existing line style, appended after `history` so the existing entries are unchanged: `blinds` (cover), `chevronUp` (open), `chevronDown` (close), `stop` (stop, Lucide `square` written as one path), `rotateCw` (fan direction) and `moveDiagonal` (tilt mode).
- `SliderView.keyStep(cur, key)`: optional, returns the next value for a handled key; `undefined` falls back to the CHO-8 steps of `SliderController.step()`. The `toggle` kind ignores it. Without it the keys behave as in 0.3.0.
- `SliderView.snap(value)`: optional, maps the value that `aria-valuenow` and `aria-valuetext` read out (for example to the speeds of a fan); the fill still follows the pointer. It runs before `valueText`, and on the `level` kind a snapped 0 reads as off (`aria-valuenow` 0, `core.off`). Without it the output is as in 0.3.0.

## 0.3.0

### Added
- `EntityWriter` extension points for a product that keeps its own writer semantics. `observe()` keeps its guard and calls the protected `reconcile(entity)` (the stale-echo loop); a failed call calls the protected `rollback(failed)` with what the failed call and the ones after it set, before the error is set; a send calls the protected `sendStarted()` and `sendSettled()` around its calls, each followed by `changed()`. `sending` stays an overridable getter. The state these read is now protected: `_inflight`, `sent`, `active`, `opts` and `stateOf()`; the `inflight` accessors stay public. The defaults are the 0.2.0 code, so nothing changes for a writer that overrides nothing.
- `WriterOptions.logLabel`: the prefix of the console error logged when a service call fails, default `liquid-core` (the 0.2.0 text).

## 0.2.0

### Added
- Products can now ship the Inter font and load it with `ensureLiquidFont(url)`, so cards look the same on every system. The font is `fonts/liquid-inter.woff2` (43 KB, family `Liquid Inter`); the SIL Open Font License 1.1 text is `fonts/OFL.txt`, and products must ship it with the font.
- A history button for sheets. A sheet can show a history button next to Close, set with `historyEntityId` in the sheet config. It closes the sheet and opens that entity's page in the Home Assistant history, without reloading the page. It is off by default.
- `openHistory(el, entityId)` goes to the history page of an entity the same way Home Assistant does.
- A new history icon (`ICONS.history`, Lucide 0.460.0, same line style as the other icons).
- The label `core.history` in English, Dutch, German, French, Spanish and Italian.

### Changed
- The sheet now uses the Liquid font itself, also when it is opened outside a card.
- The font stack of all card chrome (`dialChrome`, `tileChrome`, `badgeChrome`, `clusterChrome`) now starts with `'Liquid Inter'`: was `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, now `'Liquid Inter', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (`LIQUID_FONT_STACK`). A page that never calls `ensureLiquidFont()` looks as before. This is a visual change, so it is released in a minor version.

## 0.1.1

### Changed
- First version on npm. 0.1.0 was tagged but never published to npm, because npm only accepted a staged first version from the CI token. The code is unchanged from 0.1.0.
- The publish workflow now stages each release on npm, and a maintainer approves it before it goes live.

## 0.1.0

### Added
- First release. The package is `@decibel95/liquid-core`: ESM only, compiled to `dist/` with `.d.ts`, `sideEffects: false`, `lit` 3.2.1 as an exact peer dependency. Its contents are the 0.1.0-dev.3 pack (everything below), unchanged except for the version.
- Foundation copied from Liquid Climate 0.11.1 (commit `373b340`): `GLASS`, `MENU_GLASS`, `DOT_RING`, `ROOM_FILL`, the colour parsing and contrast helpers and `resolveGlass` (glass), the `glassTokens` styles (glass-styles), `ICONS` (icons), `STATUS_COLORS`, `TINT`, `LIGHT_TONES`, `tone()` and `rgba()` (palette), `hassNeedsRender` (render-gate), `callEntityService` and `RowCalls` (service) and the Home Assistant types (types).
- `PALETTE`: the mode colours as hex values, plus the neutral `#d5dce6`.
- `clamp`, `valueToFraction`, `snap` and `decimalsForStep` (math).
- `luminance` is now exported from glass.
- Token parity fixture `test/fixtures/lc-0.11.1-tokens.json` and a test that holds the exports to it.
- liquid-core registers no custom elements; a test greps `src/` to keep it so.
- `entityColour()` (colour): a lamp colour kept at 3:1 against the glass base and the slider track, or the neutral below HSV saturation 0.20, returning `{ hex, neutral, ok }`; plus `isNeutral`, `glassGround`, `spectrumStops`, `kelvinToRgb`, `hsvToRgb`, `rgbToHex` and the OKLCH helpers. Outputs match the gate 1 contrast tables.
- Gate 1 tokens (tokens): `SLIDER` (TOK-1 to 4, 8 to 10, plus the track and edge of the approved prototype pill), `FOCUS` (TOK-19), `READOUT` (TOK-20), `ENTITY` (TOK-11 to 13), `ART` (TOK-15 to 18), `SPECTRUM` (TOK-21), `PILL_MODES` (TOK-22).
- Icons `bulb`, `sun` and `rainbow` in `ICONS`, pinned to Lucide 0.460.0.
- `createI18n(layers)` (i18n): core, product and card string layers per language, with the core strings under `core.*` in six languages (including `core.off`, `core.unavailable` and `core.percent`), plus `flatten`, the language helpers, `num`, `numAuto`, `haLocalize`, `humanize` and `translated`.
- `LiquidSheetBase` (sheet): the glass sheet without a tag, for products to subclass.
- Editor helpers (editor): `segField`, `lookFields`, `helpLink` and `editorStyles`.
- `focusRing` (focus): 2px lc-bright, offset 2px on buttons and 3px on sliders, keyboard focus only.
- The vertical slider (slider): `SliderController`, `renderSlider()` and `sliderStyles`, with relative drag, the CHO-8 keys, slider and switch ARIA, the toggle variant for on/off-only lights, and no fill transition while dragging, under reduced motion or with motion minimal. Helpers `levelPercent`, `brightnessPercent` and `spectrumGradient`.
- `WriteQueue` with `debounceWrites(ms)` and `throttleWrites(ms)` schedules (write-queue), and `EntityWriter`, `WriterRegistry` and `WriterLease` (writer): held sent values, order-aware stale echoes, owner-tracked holds and a per-card lease.
- Card chrome copied from Liquid Climate 0.11.1 (chrome): `dialChrome`, `tileChrome`, `badgeChrome` and `clusterChrome` (alias `clusterStyles`) with their tokens `DIAL`, `TILE`, `BADGE`, `CLUSTER`, the cluster icon sizes `CLUSTER_ICON` and the `CHEVRON` path; `clusterRoomLayout` adds the room value block of the gate 2 prototype (CHO-12). A parity test compares every rule with the Liquid Climate source.
- `TINT.power` (0.28, CHO-7), `DISABLED_OPACITY` (0.3) and `UNAVAILABLE_POWER_OPACITY` (0.5) for CHO-11, and `THEME_VARS` (`--lc-radius`, `--lc-blur`, `--lc-tint`, plan D-3).
- `SLIDER.row`: the readout and pill row of the gate 2 prototype (gap 12, readout gap 8, pill inset 24, no inset at a content width of 353 or less).
- `LiquidSheetBase.openFor(owner, config, returnTo?)` and `pushHass(hass)`: the sheet follows its owner card's hass and theme variables while open and closes when the owner is removed (a synchronous move keeps it open). `config.look` is optional.
- `EntityWriter.sendNow(patch)` (and `WriteQueue.sendNow`) for discrete actions sent at once, and `EntityWriter.discard()` to drop pending and held values.
- Everything above is exported from the package root.
- Slider dev harness (`npm run dev`) and a screenshot script comparing it with the gate 2 prototype (`npm run shots:slider`).
<!-- #endregion entries -->

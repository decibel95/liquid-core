# Changelog

All notable changes to liquid-core. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

While liquid-core is 0.x, a minor bump marks any visual change (a token value, a style, an icon path) or an API break, and a patch bump marks non-visual fixes only. Every visual change is listed under `### Changed` with the token name and the old and new value.

<!-- #region entries -->
## 0.1.1

The current version.

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

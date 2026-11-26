# liquid-core

Shared building blocks for the Liquid Climate and Liquid Home card sets for Home Assistant: the glass palettes and styles, the Inter font, design tokens, entity colour, line icons, the vertical slider, the focus ring, string layers, the sheet base, editor helpers, number helpers and a few small Home Assistant helpers.

Released on npm as `@decibel95/liquid-core` from 0.1.1 on (0.1.0 was tagged but never published to npm). While it is 0.x, a minor bump marks a visual change or an API break (see [CHANGELOG.md](CHANGELOG.md)).

## Rules

- ESM only. Lit 3.2.1 is a peer dependency (exact pin, as the products).
- liquid-core never calls `customElements.define` and never uses `@customElement`. Each product registers its own prefixed tags (`liquid-climate-*`, `liquid-home-*`). A test greps `src/` to keep it so.
- Uniformity: every visual value a card draws comes from here. A new colour, icon style, size, radius, shadow, spacing or motion is first a named token in `tokens.ts` (with its approval item ID), never a literal in a component. A test checks that `slider.ts` and `focus.ts` contain no colour, px or duration literal.
- Values copied from Liquid Climate 0.11.1 are held to it by a parity test (`test/fixtures/lc-0.11.1-tokens.json`). A visual change needs a new fixture and a minor version bump.

## API overview

Everything is exported from the package root (`@decibel95/liquid-core`) and from each module path (`@decibel95/liquid-core/slider`).

| Module | Exports | What it is |
| --- | --- | --- |
| `glass` | `GLASS`, `MENU_GLASS`, `DOT_RING`, `ROOM_FILL`, `parseColor`, `composite`, `luminance`, `contrast`, `cssColorIsDark`, `themeIsDark`, `resolveGlass`, types `Rgb`, `Rgba`, `GlassPalette`, `MenuPalette` | The dark and light glass palettes, colour parsing and WCAG contrast, and the theme to glass resolution. |
| `glass-styles` | `glassTokens` | The `.g-dark` / `.g-light` custom properties (`--lc-*`), the light rim and the line icon style. |
| `palette` | `PALETTE`, `STATUS_COLORS`, `TINT`, `LIGHT_TONES`, `tone()`, `rgba()` | Mode colours as hex, status colours, tint levels and the light glass tones. |
| `colour` | `entityColour()`, `isNeutral()`, `glassGround()`, `spectrumStops()`, `kelvinToRgb()`, `hsvToRgb()`, `rgbToHex()`, `toOklch()`, `fromOklch()`, `clampChroma()`, types `EntityColour`, `EntityColourOptions`, `Oklch` | entity-colour (decision 6): a lamp colour kept at 3:1 against the glass base and the slider track, or the neutral. `entityColour(rgb, glass)` returns `{ hex, neutral, ok }`. |
| `tokens` | `SLIDER`, `FOCUS`, `READOUT`, `ENTITY`, `ART`, `SPECTRUM`, `PILL_MODES`, `THEME_VARS`, `DISABLED_OPACITY`, `UNAVAILABLE_POWER_OPACITY` | The named tokens approved at gate 1 and the shared state values (table below). |
| `chrome` | `dialChrome`, `tileChrome`, `badgeChrome`, `clusterChrome` (alias `clusterStyles`), `clusterRoomLayout`, `DIAL`, `TILE`, `BADGE`, `CLUSTER`, `CLUSTER_ICON`, `CHEVRON` | Card chrome copied from Liquid Climate 0.11.1: the glass card, header, buttons, chips, tile row, badge and cluster layouts, see below. |
| `icons` | `ICONS` | Stroke line icon paths (Lucide 0.460.0 style), including `bulb`, `sun`, `rainbow` and `history`, and for covers and fans `blinds`, `chevronUp`, `chevronDown`, `stop`, `rotateCw` and `moveDiagonal`. |
| `focus` | `focusRing` | The focus ring stylesheet (TOK-19). |
| `font` | `ensureLiquidFont(url)`, `LIQUID_FONT_FAMILY`, `LIQUID_FONT_STACK`, `LIQUID_FONT_FILE`, `LIQUID_FONT_UNICODE_RANGE`, `LIQUID_FONT_STYLE_ID` | The shipped Inter font (`fonts/liquid-inter.woff2`, family `Liquid Inter`) and the font stack of the chrome, see below. |
| `slider` | `SliderController`, `renderSlider()`, `sliderStyles`, `levelPercent()`, `brightnessPercent()`, `spectrumGradient()`, types `SliderView`, `SliderCallbacks`, `SliderKind`, `SliderSource`, `SliderMotion` | The vertical slider (decision 5), see below. Optional `SliderView.keyStep(cur, key)` replaces the key steps and `SliderView.snap(value)` maps the read-out value (fan speeds). |
| `i18n` | `createI18n()`, `coreT`, `CORE_LAYER`, `LANGUAGES`, `flatten`, `rawLanguage`, `resolveLanguage`, `num`, `numAuto`, `haLocalize`, `humanize`, `translated`, types `I18n`, `I18nLayer`, `I18nHass`, `Language`, `Vars` | String layers. `createI18n([product, ...cards])` merges core, product and card strings (later wins) per language, English as the fallback. Core strings live under `core.*` (`core.off`, `core.unavailable`, `core.percent`, `core.close`, `core.history`, `core.editor.*`). |
| `sheet` | `LiquidSheetBase`, types `SheetConfig`, `SheetOwner` | Abstract modal sheet (a `<dialog>` on glass) with an abstract `createContent(config)`. No tag: products subclass and define it. `open(config, returnTo?)` as Liquid Climate; `openFor(owner, config, returnTo?)` also follows the owner card (below). `SheetConfig.historyEntityId` is opt-in: when set, a history button sits in the header next to Close (Close and then navigate with `openHistory`), labelled `core.history`; `reconfigure()` adds or removes it. |
| `editor` | `segField()`, `lookFields()`, `helpLink()`, `editorStyles`, types `EditorT`, `LookValues` | Template helpers for card editors (segmented fields, the look section, help links). |
| `navigate` | `openHistory(el, entityId)` | Goes to HA's history page for an entity without a reload, matching HA 2026.11's own navigate(): `history.pushState({ from: location.pathname }, '', '/history?entity_id=<encoded id>')` (so HA's back arrow returns to the dashboard), then a `location-changed` event (bubbles, composed, detail `{ replace: false }`) on `window`. Not matched: HA's dialog handling, its unsaved-changes guards, and mainWindow (relevant only in popup windows). |
| `math` | `clamp`, `valueToFraction`, `snap`, `decimalsForStep` | Number helpers. |
| `render-gate` | `hassNeedsRender` | Whether a new `hass` object changes anything a card shows. |
| `service` | `callEntityService`, `RowCalls` | Service calls with error reporting. |
| `write-queue` | `WriteQueue`, `debounceWrites()`, `throttleWrites()`, types `WriteCall`, `WriteSchedule`, `WriteTimers`, `WriteQueueOptions` | Coalescing queue with two schedule policies: `debounce(ms)` (Liquid Climate: nothing is sent while held, one call after the delay) and `throttle(ms)` (Liquid Home: leading write, at most one per window, a final deduped write on release). |
| `writer` | `EntityWriter`, `WriterRegistry`, `WriterLease`, types `WriterOptions`, `SharedWriter` | One shared writer per entity (`set`, `sendNow`, `discard`, `observe`): hold of sent values until HA reports them (`hold`, default 10 s), order-aware stale echo handling, error text (`logLabel` prefixes the console error, default `liquid-core`), a ref-counted registry and a per-card lease. Protected hooks `reconcile`, `rollback`, `sendStarted` and `sendSettled` let a subclass keep its own semantics (see below). Parity notes for Liquid Climate are at the top of `src/writer.ts`. |
| `types` | `HomeAssistant`, `HassEntity`, `HassArea`, `HassFloor`, `HassDevice`, `HassEntityRegistryEntry`, `LovelaceCardEditor` | The Home Assistant types the cards use. |

### Writer

```ts
// Module level, once per product:
const writers = new WriterRegistry((id) => new EntityWriter(id, { build, schedule: throttleWrites(300) }));
// Per card:
lease = new WriterLease(writers, () => this.requestUpdate());
const writer = this.lease.get(entityId);   // acquires, and releases a previous entity's writer
writer.observe(hass);                      // on every hass
writer.set({ brightness_pct: 45 });        // a change; the schedule decides when it is sent
this.lease.release();                      // in disconnectedCallback
```

- `writer.set(patch)`: a step (drag, key, step button); the schedule decides when it goes out.
- `writer.sendNow(patch)`: a discrete action (power or toggle tap). Sent at once with anything pending, still deduped against what HA has, never overlapping a throttled send in flight (it goes out the moment that one resolves), and it starts a new throttle window. Exception: under throttle while a drag holds the queue, a change that `sendOnRelease` defers (turn_off at 0 %) still waits for the release.
- `writer.discard()`: drop the pending change, the armed timer and the held values, so a call made through another path (a room header power call) is not undone by a trailing step. Sends already issued still land; a running drag keeps its hold.

A card holds the queue through its lease, never on the writer directly: `lease.hold()` on pointerdown or the first keydown of a held key, `lease.endHold()` on pointerup or keyup, which sends the final value. With the slider that is `onStart: () => lease.hold()` and `onEnd: () => lease.endHold()`. The hold belongs to the card, so a card leaving mid-drag ends only its own hold.

A product that needs other writer semantics subclasses `EntityWriter` and overrides the protected hooks; the defaults are the behaviour above:

| Hook | Called | Default |
| --- | --- | --- |
| `reconcile(entity)` | by `observe(hass)` when the entity exists and values are in flight | Drops the in-flight values the entity caught up with (order-aware stale echoes, `matches`, `answered`). |
| `rollback(failed)` | when a call fails on a writer not disposed, before `error` is set; `failed` is what that call and the ones after it set, in patch terms | Drops only those values; with nothing left in flight the hold timer stops. |
| `sendStarted()`, `sendSettled()` | before the first call of a send and after it settles (failed or not), each followed by `changed()` | Count the sends in flight behind `sending`. An override calls `super`. |

They read the protected `_inflight` (assign it directly to keep the per-key records), `sent` (per-key records: values sent, `seen`, `from`), `active`, `opts` and `stateOf(entity, key)`. `sending` is a getter, so a subclass overrides it with `override get sending()`, not a field.

### Chrome

Each card adds `glassTokens`, `focusRing` and its chrome: `dialChrome` (light card: `.lc` glass card 40 radius, 22 padding, 16 gap; `header`, `.titles`, `.sub`, `.actions`, `.power` 44, `.modes`/`.mode`, `.chips`/`.chip` 52/16, `.alert`, `.unavailable`), `tileChrome` (`.tile` 96 high, radius 26; `.power` 50/16, `.body`, `.name`, `.sub`, `.steps`/`.step` 44, `.target`, `.sr`), `badgeChrome` (`.badge` with HA's badge tokens, `.pill`, `.round`, `.ic`, `.txt`, `.n`, `.v`) and `clusterChrome` (`.cluster` radius 36 with 16/20/24 padding per container width, room fills, `header`, `.title`, `.sum`, `.rooms`/`.room`, `.rhead`, `.rname`, `.ricon`, `.tline`, `.big`, `.deg`, `.foot`, `.empty`, the strip `.strip`, `.who`, `.chev`, `.sname`, `.sverb`, `.modes`/`.mode`, `.steps`/`.step`, `.target`, `.sr`, plus `clusterRoomLayout`). `.lc` blurs with `var(--lc-blur, var(--_blur))` and has no fallback of its own (as Liquid Climate), so a card using `dialChrome` must set `--_blur` inline on its `.lc` element from `look.blur`, as Liquid Climate does (`src/cards/dial/liquid-climate-card.ts:461` and `466`). Every rule is the Liquid Climate 0.11.1 rule with the same selector; `test/chrome.test.ts` parses both and compares declarations. The exceptions are `clusterRoomLayout` (`.room .rv`), the room value block of the gate 2 prototype (CHO-12), and the font stack: every `font-family` is `LIQUID_FONT_STACK`, which puts `'Liquid Inter'` before the Liquid Climate stack (see Font). Icons in the cluster strip use `CLUSTER_ICON` sizes and the `CHEVRON` path.

### Font

liquid-core ships the Inter font, so the cards look the same on every system instead of falling back to the system font where Inter is not installed. The chrome's font stack is `'Liquid Inter', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (`LIQUID_FONT_STACK`).

- The file is `fonts/liquid-inter.woff2` in the package (43,008 bytes, sha256 `ec9d6202...b253d7`): Inter 4.1 variable, weights 200 to 600, optical size 14, Latin and Latin Extended-A, with `tnum` for the tabular figures the chrome uses. `scripts/build-font.sh` rebuilds it byte for byte and records the source, the tool versions and the hash; a test checks the committed file's size and sha256.
- It is a separate file, not embedded in the JavaScript, so it costs nothing in the bundle and the browser caches it.
- The face is registered as `Liquid Inter`, not `Inter`. A document-level `Inter` face would also change other cards on the page whose stack starts with `Inter` (Liquid Climate 0.11.1). With its own name, only cards that use core's chrome get it.
- Without `ensureLiquidFont()` the stack falls back as before: an installed Inter, then the system font.

A consumer (a product bundle) does three things:

1. Copy the font next to its bundle at build time, from `@decibel95/liquid-core/fonts/liquid-inter.woff2` (exported as a package path; `LIQUID_FONT_FILE` is the path inside the package). For a HACS release, attach it to the release as an asset next to the `.js`: HACS downloads every release asset and serves it from `/hacsfiles/<repo>/` as `font/woff2`.

2. Call `ensureLiquidFont()` once, at module load, with the URL next to the bundle:

   ```ts
   import { ensureLiquidFont } from '@decibel95/liquid-core';

   const u = new URL(/* @vite-ignore */ './liquid-inter.woff2', import.meta.url);
   u.search = new URL(import.meta.url).search;
   ensureLiquidFont(u.href);
   ```

   The first line resolves the file next to the bundle; the `@vite-ignore` comment stops Vite library mode from rewriting the literal `new URL(...)`, which would warn or inline the font as a base64 data URL. The second line copies the bundle's own query string (HACS serves the bundle as `?hacstag=...`) onto the font URL, so a new release also busts the browser cache of the font.

3. Ship the licence with the font. The OFL (condition 2) requires the copyright notice and licence text to travel with every copy of the font. Copy `@decibel95/liquid-core/fonts/OFL.txt` (exported as a package path too) and attach it to the release as an asset next to the woff2, and add a NOTICE entry for Inter in the product that points to it.

Versioning: when the font build changes incompatibly, change `LIQUID_FONT_FAMILY` and `LIQUID_FONT_STYLE_ID` together (for example with a `-2` suffix: `Liquid Inter-2`, `liquid-core-font-2`). The first injected face wins document-wide, so an old bundle that still registers the old face must not be able to shadow the new one.

`ensureLiquidFont(url)` adds one `<style id="liquid-core-font">` with the `@font-face` rule (`font-weight: 200 600`, `font-display: swap`, the font's `unicode-range`) to `document.head`. `@font-face` does not work inside a shadow root, so it never goes there; the document-level face reaches the cards' shadow roots. The guard is that element, not module state: when several bundles each carry their own copy of core, the first call registers the face and every later call (with any URL) does nothing. Without a document (SSR, Node) it does nothing.

### Sheet

`sheet.openFor(owner, config, returnTo = owner)` opens the sheet for a card: it takes the owner's hass, follows it once per animation frame while open (by reference), takes the owner's `--lc-radius` and `--lc-blur` onto the sheet host (cleared on close), and closes when the owner is removed (decided after a microtask for a Lit owner, else on the next frame, so a synchronous move such as an HA relayout keeps it open). Only the variables it set are undone on close; an inline value the sheet host had before comes back. An owner whose render gate skips updates can call `sheet.pushHass(hass)` from `shouldUpdate`. `open(config, returnTo)` keeps the Liquid Climate behaviour (no follow). `config.look` is optional: theme glass and rich motion when absent.

### Slider

```ts
import { LitElement, html } from 'lit';
import { SliderController, renderSlider, sliderStyles, focusRing, glassTokens, brightnessPercent, entityColour } from '@decibel95/liquid-core';

class MyLightCard extends LitElement {
  static styles = [glassTokens, focusRing, sliderStyles];
  slider = new SliderController(this, {
    onStart: () => this.lease.hold(),               // pointer down or first key press
    onPreview: (pct) => this.preview(pct),          // every move: update fill and readout, no write here
    onEnd: () => this.lease.endHold(),              // pointer up, key up or blur (value is null for a tap)
    onToggle: (on) => this.toggle(on),              // on/off-only lights
  });
  render() {
    return renderSlider(this.slider, {
      kind: 'level',                                // 'level' | 'position' | 'toggle'
      value: brightnessPercent(this.stateObj.attributes.brightness),
      on: this.stateObj.state === 'on',
      available: this.stateObj.state !== 'unavailable',
      color: entityColour(rgb, glass).hex,
      label: `${name} brightness`,
      motion: this.config.look.motion,
      hass: this.hass,
    });
  }
}
```

- Kinds: `level` (brightness percent, 0 is off), `position` (White and Colour modes: a 0 to 100 position with no off; pass `valueText` for the kelvin or colour text and `stops` for the toned spectrum), `toggle` (TOK-8: on/off-only lights, role switch, full or empty).
- Drag is relative (CHO-8): the value moves by the pointer delta from the grab point, so a tap without movement changes nothing (`onEnd(null)`). On a `toggle` a tap or a drag toggles (Q6). Pointer capture keeps the drag when the pointer leaves the pill.
- Keys (CHO-8): arrows 1 %, Page Up and Page Down 10 %, Home 1 % (lowest on), End 100 %, Down from 1 % turns off. `position`: Home 0, End 100. `toggle`: Space and Enter. Key up ends the gesture, so the card's queue sends the final value.
- Custom steps: `keyStep(cur, key)` returns the next value for a key (a fan steps by its `percentage_step`); `undefined` falls back to the steps above. `snap(value)` maps the value that `aria-valuenow` and `aria-valuetext` read out, before `valueText`; the fill still follows the pointer, and on `level` a snapped 0 reads "Off". Both are optional; `toggle` ignores `keyStep`.
- ARIA: `role="slider"`, `aria-orientation="vertical"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` = `max(1, round(value))` while on and 0 when off, `aria-valuetext` from core i18n ("45%", "Off", "Unavailable") or the caller's `valueText`, `aria-label` from the caller, `aria-disabled` when unavailable. The toggle has `role="switch"` and `aria-checked`.
- Motion (TOK-10): the fill eases height and colour over 0.8 s when the value comes from HA. No transition while a gesture runs, under `prefers-reduced-motion: reduce`, or with `motion: 'minimal'`.
- The controller never writes and does not know the writer. The card holds and ends the hold on its writer lease from the callbacks.

`npm run dev` opens the harness `dev/slider.html` (both glasses through `?glass=dark|light`). `npm run shots:slider -- --proto <lh-proto/index.html> --out <dir>` screenshots the slider next to the gate 2 prototype and writes `compare.json`.

## Tokens

Item IDs refer to the Liquid Home gate 1 approval items. Lengths are px.

| Token | Value | Item |
| --- | --- | --- |
| `SLIDER.width` | 96 | TOK-1 |
| `SLIDER.height`, `SLIDER.minHeight` | 280, 200 | TOK-2 |
| `SLIDER.radius` | 26 (the tile radius) | TOK-3 |
| `SLIDER.fill` | entity colour from the bottom, opacity 1, no knob | TOK-4 |
| `SLIDER.track`, `SLIDER.edge` | `var(--lc-track)`, 1px `var(--lc-btn-edge)` (existing values, as the gate 2 prototype pill) | TOK-4, gate 2 prototype |
| `SLIDER.toggle` | role `switch`, same frame, full or empty | TOK-8 |
| `SLIDER.unavailableOpacity` | 0.3 | TOK-9 |
| `SLIDER.motion` | height and background-color, 800 ms, ease; none while dragging and under reduced motion | TOK-10 |
| `FOCUS` | 2px `var(--lc-bright)`, offset 2 on buttons, 3 on sliders | TOK-19 |
| `READOUT.value` | 18cqw, weight 200, letter spacing -0.04em | TOK-20 |
| `READOUT.unit` | 7cqw, weight 300 | TOK-20 |
| `ENTITY.minContrast` | 3 (against glass base and slider track) | TOK-11 |
| `ENTITY.neutralBelow` | HSV saturation 0.2 | TOK-12 |
| `ENTITY.step` | OKLCH lightness 0.01 per step, hue kept, chroma clamped | TOK-13 |
| neutral (`tone(PALETTE.neutral)`) | `#d5dce6` dark, `#64748b` light | TOK-14 |
| `ART.blur` | 30 | TOK-15 |
| `ART.scale` | 1.15 | TOK-16 |
| `ART.minText` | 4.5 | TOK-17 |
| `ART.lightFg2` | `rgba(16,20,27,0.86)` (`MENU_GLASS.light.fg2`) | TOK-18 |
| `SPECTRUM` | 13 kelvin stops 2000 to 6535 K, 13 hue stops every 30 degrees, target 3.15, toned per glass | TOK-21 |
| `PILL_MODES` | buttons 60 high, radius 18, tint 0.20 / 0.45, modes brightness (bulb), white (sun), colour (rainbow) | TOK-22 |
| `SLIDER.row` | readout and pill row: gap 12, readout gap 8, pill inset 24, inset 0 at a content width of 353 or less | gate 2 prototype `lh-proto/index.html:69` to `75` |
| `TINT.power` | 0.28, power button tint while on | CHO-7, LC `src/cards/dial/liquid-climate-card.ts:534` |
| `DISABLED_OPACITY` | 0.3, a control that cannot be used now | CHO-11, LC tile `.step:disabled` (`liquid-climate-tile.ts:371`), cluster `.step[aria-disabled]` (`liquid-climate-cluster.ts:809`) |
| `UNAVAILABLE_POWER_OPACITY` | 0.5, the power button of an unavailable entity | CHO-11, LC tile `.power:disabled` (`liquid-climate-tile.ts:312`) |
| `THEME_VARS` | `--lc-radius`, `--lc-blur`, `--lc-tint` | plan 4.1, D-3 |

### Chrome tokens (Liquid Climate 0.11.1, commit 373b340)

| Token | Value | Source |
| --- | --- | --- |
| `DIAL.radius`, `maxWidth`, `padding`, `gap` | 40, 444, 22, 16 | `src/cards/dial/styles.ts:11, 20, 22, 34` |
| `DIAL.saturate`, `DIAL.shadow` | 170 %, `0 40px 80px -24px rgba(0, 0, 0, 0.45)` (the `--lc-drop` fallback) | `styles.ts:26, 31` |
| `DIAL.title` | 20 / 600 / -0.02em | `styles.ts:66 to 68` |
| `DIAL.sub`, `DIAL.power` | 13, 44 | `styles.ts:111, 125` |
| `DIAL.chip` | 52 high, radius 16, key 11, value 13 | `styles.ts:393, 394, 409, 416` |
| `DIAL.alert` | radius 14, text 13 | `styles.ts:484, 488` |
| `TILE.height`, `radius`, `blur`, `saturate`, `shadow` | 96, 26, 30, 170 %, `0 20px 40px -20px rgba(0, 0, 0, 0.6)` | `src/cards/tile/liquid-climate-tile.ts:262, 267, 270, 275` |
| `TILE.power`, `bodyRadius` | 50 / radius 16, 8 | `liquid-climate-tile.ts:302, 305, 324` |
| `TILE.name`, `sub`, `value`, `step` | 16 / 600 / -0.01em, 13, 24 / 300 / -0.03em, 44 round | `liquid-climate-tile.ts:327 to 329, 335, 376 to 378, 362` |
| `BADGE.size`, `blur`, `saturate`, `shadow` | 36 (radius half of it), 22, 180 %, `0 12px 28px -14px rgba(0, 0, 0, 0.6)` | `src/cards/badge/liquid-climate-badge.ts:189, 203, 209` |
| `BADGE.padding`, `gap`, `icon`, `circleInset` | 12, 8, 18, 4 (circle 28 at size 36) | `liquid-climate-badge.ts:221, 222, 237, 242` |
| `BADGE.name`, `value` | 10, 12 (HA font token fallbacks) | `liquid-climate-badge.ts:253, 263` |
| `CLUSTER.radius`, `padding`, `gap` | 36; 16 / 20 / 24; 14 / 18 | `src/cards/cluster/liquid-climate-cluster.ts:472, 468, 841, 868, 471, 869` |
| `CLUSTER.shadow`, `title` | `0 40px 80px -24px rgba(0, 0, 0, 0.65)`, 22 | `liquid-climate-cluster.ts:480, 521` |
| `CLUSTER.room`, `value`, `control` | radius 22 / 26; value 34 / 40 / 44; 44 | `liquid-climate-cluster.ts:569, 852, 670, 856, 878, 784, 799` |
| `CLUSTER_ICON` | room 16/2, chevron 16/2, mode 18/1.9, step 18/2 | `liquid-climate-cluster.ts:300, 342, 361, 382, 393` |
| `CHEVRON` | `M9 6l6 6-6 6` | `liquid-climate-cluster.ts:28` |

## Notes

### isNeutral and the 0.20 edge

`isNeutral()` computes HSV saturation in floating point, as Python's `colorsys`, and compares with `< 0.2`. At the exact edge the float result decides: `[255, 204, 204]` gives `1 - 0.8 = 0.19999999999999996`, so it is neutral, although on paper its saturation is 0.20; `[255, 203, 203]` (0.204) is not. This matches the gate 1 contrast script (`calc/ok.py`) and is pinned by a test, so do not "fix" it with rounding: the outputs would stop matching the approved tables.

### Shared history subscriptions (design note, not built)

Sparklines (planned for Liquid Home 0.4) need history. The plan: one refcounted `history/stream` subscription per connection and entity set, shared by all cards of a bundle through a module-level registry (as the writer registry), released when the last card disconnects. Nothing of this is in 0.1; it is built when the first consumer exists.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev            # slider harness
```

`npm run parity:fixture` regenerates the parity fixture from a Liquid Climate checkout (see `scripts/parity-fixture.mjs`).

`scripts/build-font.sh` rebuilds `fonts/liquid-inter.woff2` (needs Python with fonttools 4.68.0 and brotli 1.2.1; see the script). The built file is committed, so CI and normal development do not need it. The script builds in a temporary directory and only replaces the committed file when the sha256 matches; `OUT=/some/path scripts/build-font.sh` writes the result there instead, for a check-only run.

## Licence

MIT, see [LICENSE](LICENSE). The line icons come from Lucide, see [NOTICE](NOTICE). The Inter font (`fonts/liquid-inter.woff2`) is under the SIL Open Font License 1.1, see [fonts/OFL.txt](fonts/OFL.txt) and [NOTICE](NOTICE).

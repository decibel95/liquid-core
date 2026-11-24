/**
 * Go to Home Assistant's history page for an entity, matching HA 2026.11's own navigate() (checked in the
 * shipped frontend): `history.pushState({ from: location.pathname }, '', url)`, then a `location-changed`
 * event (bubbles, composed, detail `{ replace: false }`). `from` is what HA's back arrow reads
 * (`history.state?.from !== undefined` means it can go back instead of taking its fallback). The page is not reloaded.
 * Dispatched on `window`; HA fires on its mainWindow, which differs only when the card runs in a popup window.
 * Not matched: HA's dialog handling and its unsaved-changes guards (a dirty editor does not get to veto the jump).
 * `_el` is the calling element; HA's frontend listens on window, so it only documents who asked.
 */
export function openHistory(_el: EventTarget | null | undefined, entityId: string): void {
  window.history.pushState({ from: window.location.pathname }, '', `/history?entity_id=${encodeURIComponent(entityId)}`);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false }, bubbles: true, composed: true }));
}

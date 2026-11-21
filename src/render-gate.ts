import type { HomeAssistant } from './types';

/**
 * Does a new hass object change anything a card shows? True when registries, theme, locale,
 * translation functions or unit system changed, when one of `ids` changed state, or when an entity in `awaiting`
 * has just appeared. Every other hass update is skipped, so a busy install does not
 * re-render every card on every state change.
 */
export function hassNeedsRender(
  old: HomeAssistant | undefined,
  now: HomeAssistant | undefined,
  ids: string[],
  awaiting: string[] = [],
): boolean {
  if (!old || !now) return true;
  if (old.entities !== now.entities || old.devices !== now.devices || old.areas !== now.areas || old.floors !== now.floors) return true;
  if (
    old.locale !== now.locale || old.themes !== now.themes || old.selectedTheme !== now.selectedTheme || old.language !== now.language ||
    // Home Assistant loads translations async and swaps these functions when they arrive.
    old.localize !== now.localize || old.formatEntityAttributeValue !== now.formatEntityAttributeValue || old.formatEntityState !== now.formatEntityState
  ) {
    return true;
  }
  if (old.config?.unit_system?.temperature !== now.config?.unit_system?.temperature) return true;
  return ids.some((id) => old.states[id] !== now.states[id]) || awaiting.some((id) => now.states[id]);
}

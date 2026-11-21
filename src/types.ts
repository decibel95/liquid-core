/** Minimal subset of the Home Assistant frontend types used by the card. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform: string;
  translation_key?: string | null;
  entity_category?: string | null;
  hidden?: boolean;
  display_precision?: number | null;
  area_id?: string | null;
  name?: string | null;
  /** Set by HA when a user or integration hid the entity. */
  hidden_by?: string | null;
  /** Disabled entities normally never reach the frontend registry; checked anyway. */
  disabled_by?: string | null;
}

export interface HassArea {
  area_id: string;
  name: string;
  floor_id?: string | null;
}

export interface HassFloor {
  floor_id: string;
  name: string;
  level?: number | null;
}

export interface HassDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  via_device_id?: string | null;
  area_id?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities: Record<string, HassEntityRegistryEntry>;
  devices: Record<string, HassDevice>;
  areas?: Record<string, HassArea>;
  floors?: Record<string, HassFloor>;
  config: { unit_system: { temperature: string }; version?: string };
  locale?: { language?: string; number_format?: string };
  themes?: { darkMode?: boolean } | unknown;
  selectedTheme?: unknown;
  language?: string;
  /** Home Assistant's own translations; an empty string when the key is unknown. */
  localize?(key: string, ...args: unknown[]): string;
  user?: { is_admin?: boolean };
  formatEntityState?(stateObj: HassEntity, state?: string): string;
  formatEntityAttributeValue?(stateObj: HassEntity, attribute: string, value?: unknown): string;
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<unknown> | void;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: unknown): void;
}

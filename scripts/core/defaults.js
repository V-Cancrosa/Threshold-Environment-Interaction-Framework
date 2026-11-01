import { CHANNELS, SCHEMA_VERSION, STATES } from "./constants.js";

export const DEFAULT_BARRIER = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  type: "wall",
  profile: "solid-wall",
  state: "closed",
  channels: {
    movement: "blocked",
    vision: "blocked",
    light: "blocked",
    sound: "attenuated",
    cover: "full",
    ballistic: "blocked"
  },
  /**
   * Proximity/distance thresholds in grid units, so the same profile works
   * whether a scene measures in feet, metres or anything else.
   */
  thresholds: {
    vision: null,
    light: null,
    sound: null,
    attenuation: false
  },
  /**
   * Partial channel overrides applied on top of `channels` for a given state.
   * Without an override: "open" is fully passable, "ajar" relaxes towards
   * AJAR_CHANNELS, and "closed", "locked" and "damaged" use the base channels.
   */
  stateOverrides: {},
  material: {
    id: "generic",
    /** Maximum durability; null means the barrier cannot be damaged. */
    durability: null,
    hardness: null
  },
  /** Current condition. current: null means "at full durability". */
  integrity: {
    current: null
  },
  interaction: {
    door: "none",
    playersCanOperate: false,
    lockable: false,
    destructible: false
  },
  geometry: {
    mode: "native-segment",
    openFraction: 0,
    hinge: null,
    angle: 0,
    openings: []
  }
});

/**
 * Give stateOverrides a fixed shape: every state present, every channel present,
 * null meaning "no override". Barriers are stored on documents by deep merge, so a
 * fixed shape is what guarantees a new profile fully replaces an old one.
 */
export function canonicalize(barrier) {
  const out = foundry.utils.deepClone(barrier);
  const overrides = {};
  for (const state of STATES) {
    const override = out.stateOverrides?.[state];
    const hasValues = override && CHANNELS.some(c => override[c] != null);
    overrides[state] = hasValues ? Object.fromEntries(CHANNELS.map(c => [c, override[c] ?? null])) : null;
  }
  out.stateOverrides = overrides;
  return out;
}

export function makeBarrier(...layers) {
  let barrier = foundry.utils.deepClone(DEFAULT_BARRIER);
  for (const layer of layers) {
    if (!layer) continue;
    barrier = foundry.utils.mergeObject(barrier, layer, { inplace: false, insertKeys: true, overwrite: true });
  }
  return canonicalize(barrier);
}

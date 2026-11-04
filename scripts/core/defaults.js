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
  /**
   * How the barrier looks on the map. texture: null leaves the look to Foundry.
   * stateTextures[state]: null = same as closed, "" = nothing drawn, or a path.
   * Doors use Foundry's animated door (animation type, double, direction, flip);
   * other barriers are drawn by Threshold, `thickness` grid squares thick.
   */
  appearance: {
    texture: null,
    stateTextures: { open: null, ajar: null, locked: null, damaged: null },
    animation: "swing",
    double: false,
    direction: 1,
    flip: false,
    thickness: 0.07,
    /** Repeat the texture once per grid square (true) or stretch one copy along the wall. */
    repeat: true
  },
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
  /**
   * Door geometry. mode "native-segment": ajar is approximated through the channels.
   * mode "physical": an ajar door really moves — the leaf swings around its hinge (or
   * slides back for sliding doors) by openFraction (0–1; 1 = 90° or fully retracted),
   * and Foundry works out what is visible through the gap. Until the gap is
   * passableGap grid squares wide, a movement-only helper wall keeps tokens out.
   * closedC remembers the wall's closed coordinates while the leaf is moved.
   */
  geometry: {
    mode: "native-segment",
    hinge: "a",
    swing: 1,
    openFraction: 0.33,
    passableGap: 1,
    closedC: null,
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

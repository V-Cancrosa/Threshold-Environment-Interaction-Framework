import { SCHEMA_VERSION } from "./constants.js";

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
  material: {
    id: "generic",
    durability: null,
    hardness: null
  },
  interaction: {
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

export function makeBarrier(overrides = {}) {
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_BARRIER),
    overrides,
    { inplace: false, insertKeys: true, overwrite: true }
  );
}

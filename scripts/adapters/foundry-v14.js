import { THRESHOLD_CHANNELS } from "../core/constants.js";
import { PropertyEngine } from "../properties/property-engine.js";

/** Fallbacks matching Foundry's CONST values, used only if CONST is unavailable. */
const FALLBACK = Object.freeze({
  WALL_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 },
  WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 20 },
  WALL_DOOR_TYPES: { NONE: 0, DOOR: 1, SECRET: 2 },
  WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 }
});

const constant = name => globalThis.CONST?.[name] ?? FALLBACK[name];

/** Native wall fields Threshold controls, and therefore backs up on attach. */
export const NATIVE_FIELDS = Object.freeze(["move", "sight", "light", "sound", "door", "ds", "threshold"]);

/** Threshold channel name -> native WallDocument field. */
const SENSE_FIELD = Object.freeze({ vision: "sight", light: "light", sound: "sound" });

/** Narrow compatibility boundary for Foundry VTT V14. Everything version-specific lives here. */
export class FoundryV14Adapter {
  getSelectedWalls() {
    const controlled = canvas?.walls?.controlled ?? [];
    return controlled.map(placeable => placeable.document).filter(Boolean);
  }

  getWallById(id) {
    return canvas?.scene?.walls?.get(id) ?? null;
  }

  /** Snapshot of the native fields Threshold overwrites, so remove() can restore them. */
  snapshot(wall) {
    const source = wall?._source ?? wall;
    const out = {};
    for (const field of NATIVE_FIELDS) {
      if (field in source) out[field] = foundry.utils.deepClone(source[field]);
    }
    return out;
  }

  movementValue(value) {
    const T = constant("WALL_MOVEMENT_TYPES");
    return value === "passable" ? T.NONE : T.NORMAL;
  }

  senseValue(value) {
    const T = constant("WALL_SENSE_TYPES");
    switch (value) {
      case "blocked": return T.NORMAL;
      case "limited":
      case "attenuated": return T.LIMITED;
      case "proximity": return T.PROXIMITY;
      case "distance": return T.DISTANCE;
      default: return T.NONE;
    }
  }

  doorType(mode) {
    const T = constant("WALL_DOOR_TYPES");
    return { door: T.DOOR, secret: T.SECRET }[mode] ?? T.NONE;
  }

  doorState(state) {
    const T = constant("WALL_DOOR_STATES");
    return { open: T.OPEN, locked: T.LOCKED }[state] ?? T.CLOSED;
  }

  /** Native door state -> Threshold state, used when someone clicks a door control. */
  barrierStateFromDoor(ds) {
    const T = constant("WALL_DOOR_STATES");
    if (ds === T.OPEN) return "open";
    if (ds === T.LOCKED) return "locked";
    return "closed";
  }

  /**
   * Translate a barrier profile into native WallDocument data.
   * @param {object} barrier
   * @param {number} gridDistance  Scene distance units per grid square.
   */
  toWallData(barrier, gridDistance = canvas?.scene?.grid?.distance ?? 1) {
    const channels = PropertyEngine.effectiveChannels(barrier);
    const data = {
      move: this.movementValue(channels.movement),
      door: this.doorType(barrier.interaction?.door),
      ds: this.doorState(barrier.state),
      threshold: { attenuation: Boolean(barrier.thresholds?.attenuation) }
    };
    for (const channel of THRESHOLD_CHANNELS) {
      const field = SENSE_FIELD[channel];
      data[field] = this.senseValue(channels[channel]);
      const grids = barrier.thresholds?.[channel];
      const usesThreshold = ["proximity", "distance"].includes(channels[channel]);
      data.threshold[field] = usesThreshold && typeof grids === "number" ? grids * gridDistance : null;
    }
    if (data.door === constant("WALL_DOOR_TYPES").NONE) data.ds = constant("WALL_DOOR_STATES").CLOSED;
    return data;
  }

  async updateNativeWall(wall, changes, options = {}) {
    if (!wall?.update) throw new TypeError("Expected a WallDocument.");
    return wall.update(changes, options);
  }
}

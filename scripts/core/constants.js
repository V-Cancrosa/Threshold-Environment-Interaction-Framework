export const MODULE_ID = "threshold";
export const MODULE_VERSION = "0.9.0";
export const LOG_PREFIX = "[THR]";

export const FLAG_KEY = "barrier";
export const BACKUP_FLAG_KEY = "nativeBackup";
export const SCHEMA_VERSION = 1;

/** Update option set on every write Threshold makes, so its own hooks can skip it. */
export const SYNC_OPTION = "thresholdSync";

export const CHANNELS = Object.freeze(["movement", "vision", "light", "sound", "cover", "ballistic"]);

/**
 * Allowed values for each channel, ordered from most to least restrictive. The perception channels (vision, light, sound)
 * map onto native Foundry wall senses; cover and ballistic are metadata for
 * system adapters, since Foundry has no native equivalent.
 */
export const CHANNEL_VALUES = Object.freeze({
  movement: Object.freeze(["blocked", "passable"]),
  vision: Object.freeze(["blocked", "limited", "proximity", "distance", "transparent"]),
  light: Object.freeze(["blocked", "limited", "proximity", "distance", "transmitted"]),
  sound: Object.freeze(["blocked", "attenuated", "proximity", "distance", "transmitted"]),
  cover: Object.freeze(["full", "partial", "none"]),
  ballistic: Object.freeze(["blocked", "conditional", "passable"])
});

/** Channels whose value is passed through without restriction. */
export const OPEN_CHANNELS = Object.freeze({
  movement: "passable",
  vision: "transparent",
  light: "transmitted",
  sound: "transmitted",
  cover: "none",
  ballistic: "passable"
});

/**
 * What a door left ajar lets through at most. Each channel ends up as the less
 * restrictive of this and the closed barrier's own value, so a gate stays
 * see-through when ajar.
 */
export const AJAR_CHANNELS = Object.freeze({
  movement: "blocked",
  vision: "limited",
  light: "limited",
  sound: "transmitted",
  cover: "partial",
  ballistic: "conditional"
});

/** Channels that take a native proximity/distance threshold. */
export const THRESHOLD_CHANNELS = Object.freeze(["vision", "light", "sound"]);

export const BARRIER_TYPES = Object.freeze(["wall", "door", "window", "bars", "opening", "field", "barricade"]);
export const STATES = Object.freeze(["closed", "open", "ajar", "locked", "damaged"]);
export const DOOR_MODES = Object.freeze(["none", "door", "secret"]);

/** Native door animation types Threshold offers (CONFIG.Wall.animationTypes keys). */
export const DOOR_ANIMATIONS = Object.freeze(["swing", "slide", "ascend", "descend"]);
export const GEOMETRY_MODES = Object.freeze(["native-segment", "physical"]);
/** Flag on a movement-only helper wall, holding the id of the door it belongs to. */
export const HELPER_FLAG_KEY = "helperOf";

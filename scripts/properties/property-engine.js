import { AJAR_CHANNELS, CHANNELS, CHANNEL_VALUES, OPEN_CHANNELS } from "../core/constants.js";

/** Pure property evaluation. Applying results to Foundry walls is handled by the adapter. */
export class PropertyEngine {
  /** The less restrictive of two values of the same channel. */
  static loosest(channel, a, b) {
    const order = CHANNEL_VALUES[channel];
    return order.indexOf(a) >= order.indexOf(b) ? a : b;
  }

  /**
   * The channels actually in force for the barrier's current state.
   * Precedence: explicit stateOverrides[state] > built-in open/ajar rule > base channels.
   */
  static effectiveChannels(barrier) {
    if (!barrier?.enabled) return { ...OPEN_CHANNELS };
    const base = { ...barrier.channels };
    const override = Object.entries(barrier.stateOverrides?.[barrier.state] ?? {}).filter(([, v]) => v != null);
    if (override.length) return { ...base, ...Object.fromEntries(override) };
    if (barrier.state === "open") return { ...OPEN_CHANNELS };
    if (barrier.state === "ajar") {
      return Object.fromEntries(CHANNELS.map(c => [c, this.loosest(c, base[c], AJAR_CHANNELS[c])]));
    }
    return base;
  }

  static getChannel(barrier, channel) {
    if (!CHANNELS.includes(channel)) throw new RangeError(`Unknown channel: ${channel}`);
    return this.effectiveChannels(barrier)[channel];
  }

  /**
   * Durability as numbers. Returns null for barriers without a maximum durability.
   * @returns {{current: number, max: number, ratio: number}|null}
   */
  static integrity(barrier) {
    const max = barrier?.material?.durability;
    if (typeof max !== "number" || max <= 0) return null;
    const stored = barrier.integrity?.current;
    const current = typeof stored === "number" ? Math.min(Math.max(stored, 0), max) : max;
    return { current, max, ratio: current / max };
  }

  /**
   * The texture to show in the barrier's current state: a path, "" for nothing,
   * or null when Threshold does not manage the barrier's look.
   */
  static textureFor(barrier) {
    const appearance = barrier?.appearance;
    if (!appearance?.texture) return null;
    if (!barrier.enabled) return null;
    const override = appearance.stateTextures?.[barrier.state];
    return override === null || override === undefined ? appearance.texture : override;
  }

  static isMovementBlocked(barrier) {
    return this.getChannel(barrier, "movement") === "blocked";
  }

  static isVisionBlocked(barrier) {
    return this.getChannel(barrier, "vision") === "blocked";
  }
}

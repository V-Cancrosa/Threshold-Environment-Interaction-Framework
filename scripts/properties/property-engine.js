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
    const override = barrier.stateOverrides?.[barrier.state];
    if (override) return { ...base, ...override };
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

  static isMovementBlocked(barrier) {
    return this.getChannel(barrier, "movement") === "blocked";
  }

  static isVisionBlocked(barrier) {
    return this.getChannel(barrier, "vision") === "blocked";
  }
}

/** Pure property evaluation. Applying results to Foundry walls is handled by the adapter. */
export class PropertyEngine {
  static isMovementBlocked(barrier) {
    if (!barrier?.enabled) return false;
    if (barrier.state === "open") return false;
    return barrier.channels?.movement === "blocked";
  }

  static isVisionBlocked(barrier) {
    if (!barrier?.enabled) return false;
    return barrier.channels?.vision === "blocked";
  }

  static getChannel(barrier, channel) {
    return barrier?.channels?.[channel] ?? "undefined";
  }
}

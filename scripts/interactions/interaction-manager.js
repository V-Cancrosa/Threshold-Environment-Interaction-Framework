/** Interaction policy. Player-to-GM request transport for non-door barriers is a later milestone. */
export class InteractionManager {
  canOperate(user, barrier) {
    if (!user || !barrier) return false;
    if (user.isGM) return true;
    return barrier.interaction?.playersCanOperate === true;
  }

  /** The state a simple "use" action moves to. Locked barriers stay locked. */
  nextDoorState(state) {
    if (state === "locked") return "locked";
    if (state === "closed" || state === "ajar") return "open";
    return "closed";
  }
}

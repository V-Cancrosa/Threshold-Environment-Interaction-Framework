/** MVP interaction policy. Actual player-to-GM request transport is a later milestone. */
export class InteractionManager {
  canOperate(user, barrier) {
    if (!user || !barrier) return false;
    if (user.isGM) return true;
    return barrier.interaction?.playersCanOperate === true;
  }

  nextDoorState(state) {
    if (state === "closed" || state === "ajar") return "open";
    return "closed";
  }
}

import { FLAG_KEY, LOG_PREFIX, MODULE_ID } from "../core/constants.js";

export const SOCKET = `module.${MODULE_ID}`;
/** One wheel notch moves the door by this much (0.05 = 4.5° or 5% slid back). */
export const AJAR_STEP = 0.05;

const round = v => Math.round(v * 100) / 100;

/**
 * Where a door ends up after `steps` wheel notches (positive = further open).
 * A closed door starts at 0, an open one at 1; reaching 0 closes it.
 * @returns {{state: string, openFraction?: number}}
 */
export function stepAjar(barrier, steps) {
  const start = barrier.state === "ajar" ? barrier.geometry?.openFraction ?? 0
    : barrier.state === "open" ? 1 : 0;
  const next = round(Math.min(1, Math.max(0, start + steps * AJAR_STEP)));
  if (next <= 0) return { state: "closed" };
  return { state: "ajar", openFraction: next };
}

/**
 * Why a user may not stand this barrier ajar, as an i18n key suffix, or null if allowed.
 * Checked on the player's client for quick feedback and again by the GM.
 */
export function ajarRefusal(user, barrier) {
  if (!barrier?.enabled) return "NoBarrier";
  const door = barrier.interaction?.door ?? "none";
  if (door === "none") return "NotDoor";
  if (barrier.state === "locked") return "Locked";
  if (user?.isGM) return null;
  if (door === "secret" || !barrier.interaction?.playersCanOperate) return "NotAllowed";
  return null;
}

/**
 * Alt + mouse wheel over a door icon stands the door ajar, notch by notch. GMs change
 * the door directly; players send a request that the active GM checks and applies.
 */
export class CanvasAjar {
  constructor({ barriers }) {
    this.barriers = barriers;
    this.pending = null;
    this._timer = null;
    this._onWheel = this._onWheel.bind(this);
  }

  /** Listen on window in the capture phase so this runs before Foundry's own wheel handling. */
  activate() {
    window.addEventListener("wheel", this._onWheel, { capture: true, passive: false });
    game.socket?.on(SOCKET, (data, senderId) => this._onSocket(data, senderId));
  }

  /** The door whose control icon is under a canvas point, if any. */
  doorAt(point) {
    const radius = Math.max(24, (canvas.dimensions?.size ?? 100) * 0.35);
    let best = null;
    let bestDistance = radius;
    for (const wall of canvas.scene?.walls ?? []) {
      if (!wall.door) continue;
      const control = wall.object?.doorControl;
      if (!game.user.isGM && !control?.visible) continue;
      const [x0, y0, x1, y1] = wall.c;
      const centre = control ? { x: control.x + (control.width ?? 0) / 2, y: control.y + (control.height ?? 0) / 2 } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
      const mid = Math.hypot(point.x - (x0 + x1) / 2, point.y - (y0 + y1) / 2);
      const d = Math.min(distance, mid);
      if (d <= bestDistance) {
        best = wall;
        bestDistance = d;
      }
    }
    return best;
  }

  _onWheel(event) {
    if (!event.altKey || !canvas?.ready || event.target !== canvas.app?.view) return;
    const point = canvas.canvasCoordinatesFromClient?.({ x: event.clientX, y: event.clientY })
      ?? canvas.stage.worldTransform.applyInverse({ x: event.clientX, y: event.clientY });
    const wall = this.doorAt(point);
    if (!wall) return;
    const barrier = wall.getFlag(MODULE_ID, FLAG_KEY);
    if (!barrier) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const refusal = ajarRefusal(game.user, barrier);
    if (refusal) {
      this._warn(refusal);
      return;
    }
    // Scroll up opens further. Notches are gathered briefly so a quick spin is one update.
    const steps = event.deltaY < 0 ? 1 : -1;
    if (this.pending?.wall !== wall) this._flush();
    this.pending = { wall, steps: (this.pending?.steps ?? 0) + steps };
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), 150);
  }

  async _flush() {
    clearTimeout(this._timer);
    const pending = this.pending;
    this.pending = null;
    if (!pending?.steps) return;
    const { wall, steps } = pending;
    if (game.user.isGM) {
      await this.apply(wall, steps, game.user);
      return;
    }
    if (!game.users.activeGM) {
      this._warn("NoGM");
      return;
    }
    game.socket.emit(SOCKET, { action: "ajar", sceneId: wall.parent.id, wallId: wall.id, steps, userId: game.user.id });
  }

  /** Apply wheel steps to a door, after checking that `user` may do it. */
  async apply(wall, steps, user) {
    const barrier = wall.getFlag(MODULE_ID, FLAG_KEY);
    const refusal = ajarRefusal(user, barrier);
    if (refusal) return refusal;
    const { state, openFraction } = stepAjar(barrier, steps);
    try {
      if (state === "ajar") await this.barriers.setAjar(wall, openFraction);
      else await this.barriers.setState(wall, state);
    } catch (err) {
      console.error(`${LOG_PREFIX} Could not stand door ${wall.id} ajar.`, err);
    }
    return null;
  }

  async _onSocket(data, senderId) {
    if (data?.action !== "ajar" || !game.users.activeGM?.isSelf) return;
    // Foundry's sender id can be trusted; a user id inside the payload cannot, so a
    // request without a sender id is always judged with player permissions.
    const user = game.users.get(senderId ?? data.userId);
    const asUser = senderId ? user : { isGM: false, name: user?.name };
    const wall = game.scenes.get(data.sceneId)?.walls.get(data.wallId);
    const steps = Math.max(-20, Math.min(20, Math.trunc(Number(data.steps) || 0)));
    if (!user || !wall || !steps) return;
    const refusal = await this.apply(wall, steps, asUser);
    if (refusal) console.info(`${LOG_PREFIX} Refused ${user.name}'s request to move door ${wall.id}: ${refusal}.`);
  }

  _warn(reason) {
    ui.notifications?.warn(game.i18n.localize(`THRESHOLD.Ajar.${reason}`));
  }
}

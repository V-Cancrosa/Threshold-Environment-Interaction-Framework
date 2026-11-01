import { FLAG_KEY, HELPER_FLAG_KEY, LOG_PREFIX, MODULE_ID, SYNC_OPTION } from "./constants.js";
import { GeometryEngine } from "../geometry/geometry-engine.js";

/**
 * Movement-only walls that sit in the frame of a physically ajar door while the gap is
 * too narrow to pass. Foundry tests movement with a single ray from the token's centre,
 * so without one a token could slip through a door opened a crack.
 * All methods must run on one client only: the active GM.
 */
export class HelperWalls {
  constructor({ adapter }) {
    this.adapter = adapter;
  }

  static isHelper(wall) {
    return Boolean(wall?.getFlag?.(MODULE_ID, HELPER_FLAG_KEY));
  }

  find(scene, wallId) {
    return [...(scene?.walls ?? [])].filter(w => w.getFlag(MODULE_ID, HELPER_FLAG_KEY) === wallId);
  }

  helperData(wallId, c) {
    return {
      c,
      move: this.adapter.movementValue("blocked"),
      sight: this.adapter.senseValue("transparent"),
      light: this.adapter.senseValue("transparent"),
      sound: this.adapter.senseValue("transparent"),
      door: this.adapter.doorType("none"),
      flags: { [MODULE_ID]: { [HELPER_FLAG_KEY]: wallId } }
    };
  }

  /** Create, move or delete the helper of one door so it matches the door's state. */
  async sync(wall) {
    const scene = wall?.parent;
    if (!scene || HelperWalls.isHelper(wall)) return;
    const barrier = wall.getFlag(MODULE_ID, FLAG_KEY);
    const gridSize = scene.grid?.size ?? 100;
    const spec = barrier ? GeometryEngine.helperFor(barrier, gridSize) : null;
    const [keep, ...extra] = this.find(scene, wall.id);
    try {
      const remove = spec ? extra : [keep, ...extra].filter(Boolean);
      if (remove.length) await scene.deleteEmbeddedDocuments("Wall", remove.map(w => w.id), { [SYNC_OPTION]: true });
      if (!spec) return;
      if (!keep) await scene.createEmbeddedDocuments("Wall", [this.helperData(wall.id, spec.c)], { [SYNC_OPTION]: true });
      else if (keep.c.some((v, i) => v !== spec.c[i])) await keep.update({ c: spec.c }, { [SYNC_OPTION]: true });
    } catch (err) {
      console.error(`${LOG_PREFIX} Could not update the helper wall of door ${wall.id}.`, err);
    }
  }

  /** The door was deleted: remove its helper too. */
  async removeFor(wallId, scene) {
    const helpers = this.find(scene, wallId);
    if (helpers.length) await scene.deleteEmbeddedDocuments("Wall", helpers.map(w => w.id), { [SYNC_OPTION]: true });
  }
}

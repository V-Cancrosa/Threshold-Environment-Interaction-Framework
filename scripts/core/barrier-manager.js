import { BACKUP_FLAG_KEY, FLAG_KEY, LOG_PREFIX, MODULE_ID, STATES, SYNC_OPTION } from "./constants.js";
import { makeBarrier } from "./defaults.js";
import { validateBarrier } from "./validator.js";

/**
 * Owns the barrier profile stored on a WallDocument and keeps the wall's native
 * movement/perception fields in step with it. Every write is a single document
 * update carrying both the flag and the native fields, so clients never see a
 * half-applied barrier.
 */
export class BarrierManager {
  /**
   * @param {object} deps
   * @param {import("../profiles/profile-registry.js").ProfileRegistry} deps.profiles
   * @param {import("../adapters/foundry-v14.js").FoundryV14Adapter} deps.adapter
   * @param {() => boolean} [deps.syncEnabled]  Whether native wall fields should be written.
   */
  constructor({ profiles, adapter, syncEnabled = () => true }) {
    this.profiles = profiles;
    this.adapter = adapter;
    this.syncEnabled = syncEnabled;
  }

  get(document) {
    if (!document?.getFlag) throw new TypeError("Expected a Foundry Document with getFlag().");
    return document.getFlag(MODULE_ID, FLAG_KEY) ?? null;
  }

  has(document) {
    return Boolean(this.get(document));
  }

  /**
   * Attach a barrier to a wall, replacing any existing one.
   * @param {WallDocument} document
   * @param {string|object} profileOrData  A profile id, or barrier data (may name a `profile`).
   * @param {object} [overrides]           Applied on top of the profile.
   */
  async attach(document, profileOrData = {}, overrides = {}) {
    this.#assertGM();
    if (!document?.update) throw new TypeError("Expected a WallDocument.");
    const data = typeof profileOrData === "string" ? { profile: profileOrData } : profileOrData;
    const profileData = data.profile && this.profiles.get(data.profile) ? this.profiles.resolve(data.profile) : null;
    if (data.profile && !profileData && typeof profileOrData === "string") {
      throw new Error(`Unknown barrier profile: ${data.profile}`);
    }
    const barrier = makeBarrier(profileData, data, overrides);
    this.#validate(barrier);

    const hadBarrier = this.has(document);
    // Replace rather than deep-merge, so keys from a previous profile cannot leak in.
    if (hadBarrier) await document.unsetFlag(MODULE_ID, FLAG_KEY);
    const changes = { [`flags.${MODULE_ID}.${FLAG_KEY}`]: barrier, ...this.#nativeChanges(barrier) };
    if (!document.getFlag(MODULE_ID, BACKUP_FLAG_KEY)) {
      changes[`flags.${MODULE_ID}.${BACKUP_FLAG_KEY}`] = this.adapter.snapshot(document);
    }
    await document.update(changes, { [SYNC_OPTION]: true });
    return barrier;
  }

  /** Attach the same profile to many walls (defaults to the selected ones). */
  async attachMany(profileOrData, walls = this.adapter.getSelectedWalls(), overrides = {}) {
    const results = [];
    for (const wall of walls) results.push(await this.attach(wall, profileOrData, overrides));
    return results;
  }

  async update(document, changes = {}) {
    this.#assertGM();
    const current = this.#require(document);
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(current), changes, {
      inplace: false, insertKeys: true, overwrite: true
    });
    this.#validate(next);
    await this.#write(document, next);
    return next;
  }

  async setState(document, state) {
    if (!STATES.includes(state)) throw new RangeError(`Invalid state: ${state}`);
    return this.update(document, { state });
  }

  /** Re-apply the stored barrier to the native wall fields (e.g. after editing the wall by hand). */
  async sync(document) {
    this.#assertGM();
    await this.#write(document, this.#require(document));
  }

  /** Remove the barrier and restore the native fields captured when it was first attached. */
  async remove(document) {
    this.#assertGM();
    const backup = document.getFlag(MODULE_ID, BACKUP_FLAG_KEY);
    if (backup) await document.update(backup, { [SYNC_OPTION]: true });
    await document.unsetFlag(MODULE_ID, FLAG_KEY);
    await document.unsetFlag(MODULE_ID, BACKUP_FLAG_KEY);
  }

  /**
   * A native door control was used (by a GM or a player). Mirror the new door
   * state into the barrier and re-derive the native senses for that state,
   * e.g. so closing a door that was ajar restores full vision blocking.
   * Must only run on one client: the active GM.
   */
  async handleNativeDoorChange(document) {
    const current = this.get(document);
    if (!current || !current.enabled) return;
    const state = this.adapter.barrierStateFromDoor(document.ds);
    if (state === current.state) return;
    const next = { ...foundry.utils.deepClone(current), state };
    try {
      await this.#write(document, next);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to mirror door state on wall ${document.id}.`, err);
    }
  }

  async #write(document, barrier) {
    await document.update(
      { [`flags.${MODULE_ID}.${FLAG_KEY}`]: barrier, ...this.#nativeChanges(barrier) },
      { [SYNC_OPTION]: true }
    );
  }

  #nativeChanges(barrier) {
    return this.syncEnabled() ? this.adapter.toWallData(barrier) : {};
  }

  #require(document) {
    const current = this.get(document);
    if (!current) throw new Error("This wall has no Threshold barrier profile.");
    return current;
  }

  #validate(barrier) {
    const errors = validateBarrier(barrier);
    if (errors.length) throw new Error(`Invalid Threshold barrier: ${errors.join("; ")}`);
  }

  #assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can modify Threshold barrier profiles.");
  }
}

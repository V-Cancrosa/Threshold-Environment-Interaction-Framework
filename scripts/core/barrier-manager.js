import { BACKUP_FLAG_KEY, FLAG_KEY, LOG_PREFIX, MODULE_ID, STATES, SYNC_OPTION } from "./constants.js";
import { canonicalize, makeBarrier } from "./defaults.js";
import { validateBarrier } from "./validator.js";
import { PropertyEngine } from "../properties/property-engine.js";

const callHook = (name, ...args) => globalThis.Hooks?.call?.(name, ...args);
const callAllHook = (name, ...args) => globalThis.Hooks?.callAll?.(name, ...args);

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
    const next = makeBarrier(current, changes);
    this.#validate(next);
    await this.#write(document, next);
    return next;
  }

  async setState(document, state) {
    if (!STATES.includes(state)) throw new RangeError(`Invalid state: ${state}`);
    return this.update(document, { state });
  }

  /**
   * Deal damage to a barrier. When durability reaches 0 the barrier switches to the
   * "damaged" state, whose channels come from the profile (e.g. a broken window).
   *
   * Hooks for system adapters:
   * - `threshold.preDamage` (context) — change `context.amount` (e.g. apply hardness or
   *   resistances) or return false to cancel.
   * - `threshold.damage` (wall, barrier, {amount, previous, current}) after the update.
   * - `threshold.broken` (wall, barrier) when durability reaches 0.
   *
   * @param {WallDocument} document
   * @param {number} amount
   * @param {object} [options]
   * @param {boolean} [options.force]  Also damage barriers not marked destructible.
   * @param {*} [options.source]       Passed through to hooks (an actor, an item, a roll…).
   */
  async damage(document, amount, { force = false, source = null } = {}) {
    this.#assertGM();
    const barrier = this.#require(document);
    const integrity = PropertyEngine.integrity(barrier);
    if (!integrity) throw new Error("This barrier has no durability.");
    if (!barrier.interaction?.destructible && !force) {
      throw new Error("This barrier is not destructible. Pass { force: true } to damage it anyway.");
    }
    const context = { wall: document, barrier, amount: Number(amount), source };
    if (!Number.isFinite(context.amount) || context.amount < 0) throw new RangeError("Damage must be a non-negative number.");
    if (callHook(`${MODULE_ID}.preDamage`, context) === false) return barrier;

    const current = Math.max(0, integrity.current - Math.max(0, Number(context.amount) || 0));
    const changes = { integrity: { current } };
    const broken = current === 0 && integrity.current > 0;
    if (broken) changes.state = "damaged";
    const next = await this.update(document, changes);
    callAllHook(`${MODULE_ID}.damage`, document, next, { amount: integrity.current - current, previous: integrity.current, current, source });
    if (broken) callAllHook(`${MODULE_ID}.broken`, document, next, { source });
    return next;
  }

  /**
   * Restore durability (fully when amount is omitted). A barrier brought back above 0
   * from the "damaged" state returns to "closed".
   */
  async repair(document, amount = Infinity) {
    this.#assertGM();
    const barrier = this.#require(document);
    const integrity = PropertyEngine.integrity(barrier);
    if (!integrity) throw new Error("This barrier has no durability.");
    const value = Number(amount);
    if (Number.isNaN(value) || value < 0) throw new RangeError("Repair must be a non-negative number.");
    const current = Math.min(integrity.max, integrity.current + value);
    const changes = { integrity: { current: current === integrity.max ? null : current } };
    if (current > 0 && barrier.state === "damaged") changes.state = "closed";
    const next = await this.update(document, changes);
    callAllHook(`${MODULE_ID}.repair`, document, next, { previous: integrity.current, current });
    return next;
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
    const next = canonicalize({ ...current, state });
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

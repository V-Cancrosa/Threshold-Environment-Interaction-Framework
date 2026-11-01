import { MODULE_ID, FLAG_KEY } from "./constants.js";
import { makeBarrier } from "./defaults.js";
import { validateBarrier } from "./validator.js";

export class BarrierManager {
  get(document) {
    if (!document?.getFlag) throw new TypeError("Expected a Foundry Document with getFlag().");
    return document.getFlag(MODULE_ID, FLAG_KEY) ?? null;
  }

  async attach(document, data = {}) {
    this.#assertGM();
    if (!document?.setFlag) throw new TypeError("Expected a Foundry Document with setFlag().");
    const barrier = makeBarrier(data);
    const errors = validateBarrier(barrier);
    if (errors.length) throw new Error(`Invalid Threshold barrier: ${errors.join("; ")}`);
    await document.setFlag(MODULE_ID, FLAG_KEY, barrier);
    return barrier;
  }

  async update(document, changes = {}) {
    this.#assertGM();
    const current = this.get(document);
    if (!current) throw new Error("This wall has no Threshold barrier profile.");
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(current), changes, {
      inplace: false, insertKeys: true, overwrite: true
    });
    const errors = validateBarrier(next);
    if (errors.length) throw new Error(`Invalid Threshold barrier: ${errors.join("; ")}`);
    await document.setFlag(MODULE_ID, FLAG_KEY, next);
    return next;
  }

  async remove(document) {
    this.#assertGM();
    await document.unsetFlag(MODULE_ID, FLAG_KEY);
  }

  #assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can modify Threshold barrier profiles in this prototype.");
  }
}

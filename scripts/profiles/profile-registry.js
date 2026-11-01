import { MODULE_ID, LOG_PREFIX } from "../core/constants.js";

/**
 * Named barrier and material profiles. Ships with the JSON presets in /profiles;
 * system adapters and worlds can add their own through register().
 */
export class ProfileRegistry {
  #barriers = new Map();
  #materials = new Map();

  async loadDefaults(basePath = `modules/${MODULE_ID}/profiles`) {
    const [barriers, materials] = await Promise.all([
      fetch(`${basePath}/barriers.json`).then(r => r.json()),
      fetch(`${basePath}/materials.json`).then(r => r.json())
    ]);
    this.registerMany(barriers, materials);
  }

  registerMany(barriers = {}, materials = {}) {
    for (const [id, data] of Object.entries(materials)) this.registerMaterial(id, data);
    for (const [id, data] of Object.entries(barriers)) this.register(id, data);
  }

  register(id, data) {
    if (typeof id !== "string" || !id) throw new TypeError("Profile id must be a non-empty string.");
    if (this.#barriers.has(id)) console.info(`${LOG_PREFIX} Overriding barrier profile "${id}".`);
    this.#barriers.set(id, foundry.utils.deepClone(data));
  }

  registerMaterial(id, data) {
    if (typeof id !== "string" || !id) throw new TypeError("Material id must be a non-empty string.");
    this.#materials.set(id, foundry.utils.deepClone(data));
  }

  get(id) {
    const data = this.#barriers.get(id);
    return data ? foundry.utils.deepClone(data) : null;
  }

  getMaterial(id) {
    const data = this.#materials.get(id);
    return data ? foundry.utils.deepClone(data) : null;
  }

  list() {
    return [...this.#barriers.keys()];
  }

  listMaterials() {
    return [...this.#materials.keys()];
  }

  /**
   * Expand a profile id into barrier data: profile fields, plus the material's
   * durability/hardness unless the profile sets them itself.
   */
  resolve(id) {
    const profile = this.get(id);
    if (!profile) throw new Error(`Unknown barrier profile: ${id}`);
    const materialId = profile.material?.id;
    if (materialId) {
      const material = this.getMaterial(materialId);
      if (!material) throw new Error(`Profile "${id}" references unknown material "${materialId}".`);
      profile.material = {
        id: materialId,
        durability: material.durability ?? null,
        hardness: material.hardness ?? null,
        ...profile.material
      };
    }
    return { ...profile, profile: id };
  }
}

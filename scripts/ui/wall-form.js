import { BACKUP_FLAG_KEY, CHANNELS, CHANNEL_VALUES, DOOR_ANIMATIONS, DOOR_MODES, FLAG_KEY, MODULE_ID, STATES, THRESHOLD_CHANNELS } from "../core/constants.js";
import { makeBarrier } from "../core/defaults.js";
import { validateBarrier } from "../core/validator.js";

/** Form fields of the Threshold tab live under this key, so the sheet submits them with everything else. */
export const UI_KEY = "ui";
export const UI_PREFIX = `flags.${MODULE_ID}.${UI_KEY}`;

const toNumber = value => (value === "" || value === null || value === undefined ? null : Number(value));
const toBool = value => value === true || value === "true" || value === "on";

/**
 * Pull the Threshold tab's values out of a pending wall update, whether the sheet
 * submitted them expanded (ApplicationV2) or as dotted keys, and remove them so they
 * are never stored.
 * @returns {object|null} the tab's values, or null if the update did not come from the tab
 */
export function extractFormData(changes) {
  let ui = changes.flags?.[MODULE_ID]?.[UI_KEY] ?? null;
  if (ui) delete changes.flags[MODULE_ID][UI_KEY];
  for (const key of Object.keys(changes)) {
    if (!key.startsWith(`${UI_PREFIX}.`)) continue;
    ui ??= {};
    foundry.utils.setProperty(ui, key.slice(UI_PREFIX.length + 1), changes[key]);
    delete changes[key];
  }
  return ui;
}

/**
 * Build the barrier described by the tab, or null when the tab says "no profile".
 * The tab only edits base fields; stateOverrides come from the profile, or are kept
 * from the existing barrier when its profile is unchanged.
 */
export function barrierFromForm(ui, existing, profiles) {
  const profileId = ui.profile || "";
  if (!profileId) return null;

  let base;
  if (existing && existing.profile === profileId) base = existing;
  else if (profiles.get(profileId)) base = profiles.resolve(profileId);
  else throw new Error(`Unknown barrier profile: ${profileId}`);

  const door = DOOR_MODES.includes(ui.interaction?.door) ? ui.interaction.door : base.interaction?.door ?? "none";
  let state = STATES.includes(ui.state) ? ui.state : base.state ?? "closed";
  if (door === "none" && ["ajar", "locked"].includes(state)) state = "closed";

  const channels = {};
  for (const channel of CHANNELS) {
    const value = ui.channels?.[channel];
    if (CHANNEL_VALUES[channel].includes(value)) channels[channel] = value;
  }

  const thresholds = {};
  for (const channel of THRESHOLD_CHANNELS) {
    if (ui.thresholds && channel in ui.thresholds) thresholds[channel] = toNumber(ui.thresholds[channel]);
  }
  if (ui.thresholds && "attenuation" in ui.thresholds) thresholds.attenuation = toBool(ui.thresholds.attenuation);

  const interaction = { door };
  for (const key of ["playersCanOperate", "lockable", "destructible"]) {
    if (ui.interaction && key in ui.interaction) interaction[key] = toBool(ui.interaction[key]);
  }

  const material = {};
  const materialId = ui.material?.id;
  if (materialId && materialId !== base.material?.id) {
    const registered = profiles.getMaterial(materialId);
    if (!registered) throw new Error(`Unknown material: ${materialId}`);
    Object.assign(material, { id: materialId, durability: registered.durability ?? null, hardness: registered.hardness ?? null });
  }
  if (ui.material && "durability" in ui.material) material.durability = toNumber(ui.material.durability);

  // Current durability: empty means full; values at or above the maximum are stored as full.
  const integrity = {};
  if (ui.integrity && "current" in ui.integrity) {
    const max = "durability" in material ? material.durability : base.material?.durability ?? null;
    const current = toNumber(ui.integrity.current);
    integrity.current = typeof max !== "number" || current === null || current >= max ? null : Math.max(0, current);
  }

  const appearance = {};
  const ua = ui.appearance;
  if (ua && typeof ua === "object") {
    if ("texture" in ua) appearance.texture = ua.texture ? String(ua.texture).trim() || null : null;
    if (DOOR_ANIMATIONS.includes(ua.animation)) appearance.animation = ua.animation;
    if ("double" in ua) appearance.double = toBool(ua.double);
    if ("repeat" in ua) appearance.repeat = toBool(ua.repeat);
    const thickness = toNumber(ua.thickness);
    if (thickness !== null && thickness > 0 && thickness <= 2) appearance.thickness = thickness;
    if (ua.stateTextures && typeof ua.stateTextures === "object") {
      appearance.stateTextures = {};
      for (const [s, value] of Object.entries(ua.stateTextures)) {
        if (!STATES.includes(s) || !value) continue;
        const path = String(value.path ?? "").trim();
        appearance.stateTextures[s] = value.mode === "none" ? "" : value.mode === "custom" && path ? path : null;
      }
    }
  }

  const layer = { profile: profileId, state, channels, thresholds, interaction, material, integrity, appearance };
  // For each state the tab sends, its selects replace the override entirely (an empty
  // select means "no override"). States the tab does not show keep the base's override.
  if (ui.stateOverrides && typeof ui.stateOverrides === "object") {
    layer.stateOverrides = Object.fromEntries(STATES.map(s => {
      if (!(s in ui.stateOverrides)) return [s, base.stateOverrides?.[s] ?? null];
      return [s, Object.fromEntries(CHANNELS.map(c => {
        const value = ui.stateOverrides[s]?.[c];
        return [c, CHANNEL_VALUES[c].includes(value) ? value : null];
      }))];
    }));
  }
  return makeBarrier(base, layer);
}

/**
 * Rewrite a pending wall update coming from the wall sheet: turn the tab's values into
 * the stored barrier and the matching native fields, or restore the native backup when
 * the profile was cleared.
 * @returns {boolean} whether the update carried Threshold tab data
 */
export function applyFormToChanges(document, changes, { profiles, adapter, syncEnabled = () => true }) {
  const ui = extractFormData(changes);
  if (!ui) return false;

  const existing = document.getFlag(MODULE_ID, FLAG_KEY) ?? null;
  const barrier = barrierFromForm(ui, existing, profiles);
  const flags = ((changes.flags ??= {})[MODULE_ID] ??= {});

  if (!barrier) {
    if (!existing) return true;
    const backup = document.getFlag(MODULE_ID, BACKUP_FLAG_KEY);
    if (backup && syncEnabled()) Object.assign(changes, foundry.utils.deepClone(backup));
    // null rather than a deletion operator: works the same on every Foundry version.
    flags[FLAG_KEY] = null;
    flags[BACKUP_FLAG_KEY] = null;
    return true;
  }

  const errors = validateBarrier(barrier);
  if (errors.length) throw new Error(errors.join("; "));
  flags[FLAG_KEY] = barrier;
  const backup = document.getFlag(MODULE_ID, BACKUP_FLAG_KEY) ?? adapter.snapshot(document);
  if (!document.getFlag(MODULE_ID, BACKUP_FLAG_KEY)) flags[BACKUP_FLAG_KEY] = backup;
  if (syncEnabled()) Object.assign(changes, adapter.toWallData(barrier, undefined, backup));
  return true;
}

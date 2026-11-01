import { MODULE_ID } from "../core/constants.js";

const BASE = `modules/${MODULE_ID}/assets/textures`;

/** Textures shipped with Threshold, offered as quick picks in the wall sheet. */
export const BUNDLED_TEXTURES = Object.freeze([
  "wood-door", "door-broken", "steel-door", "gate", "glass-door", "frosted-glass-door",
  "window", "window-broken", "curtains-closed", "curtains-open", "armored-glass", "bars",
  "viewing-slot", "force-field", "barricade", "barricade-broken"
].map(id => Object.freeze({ id, src: `${BASE}/${id}.svg` })));

/** Open Foundry's file picker for images and write the chosen path into an input. */
export function browseImage(input) {
  const FilePickerClass = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FilePickerClass) return;
  new FilePickerClass({
    type: "image",
    current: input.value,
    callback: path => {
      input.value = path;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }).render(true);
}

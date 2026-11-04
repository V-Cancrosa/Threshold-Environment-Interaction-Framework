import { CHANNELS, CHANNEL_VALUES, DOOR_ANIMATIONS, DOOR_MODES, FLAG_KEY, MODULE_ID, STATES, THRESHOLD_CHANNELS } from "../core/constants.js";
import { makeBarrier } from "../core/defaults.js";
import { PropertyEngine } from "../properties/property-engine.js";
import { GeometryEngine } from "../geometry/geometry-engine.js";
import { HelperWalls } from "../core/helper-walls.js";
import { UI_PREFIX, barrierFromForm } from "./wall-form.js";
import { integrityColorNumber } from "../canvas/durability-bars.js";
import { BUNDLED_TEXTURES, browseImage } from "./textures.js";

/** Native WallConfig inputs that Threshold takes over while a profile is active. */
const NATIVE_SELECTOR = ["move", "sight", "light", "sound", "door", "ds"].map(n => `[name="${n}"]`)
  .concat('[name^="threshold."]').join(", ");

/** States whose behaviour can be overridden; "closed" is the base itself. */
const OVERRIDE_STATES = Object.freeze(["open", "ajar", "locked", "damaged"]);
const DOOR_ONLY_STATES = Object.freeze(["ajar", "locked"]);

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const t = key => game.i18n.localize(key);

function option(value, label, selected) {
  return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
}

/** Font Awesome icon per channel, used in labels and the state matrix. */
const CHANNEL_ICONS = Object.freeze({
  movement: "fa-solid fa-person-walking",
  vision: "fa-solid fa-eye",
  light: "fa-solid fa-lightbulb",
  sound: "fa-solid fa-volume-high",
  cover: "fa-solid fa-shield-halved",
  ballistic: "fa-solid fa-crosshairs"
});

const MATRIX_STATES = Object.freeze(["closed", ...OVERRIDE_STATES]);

const getPath = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);

function channelLabel(channel) {
  return `<i class="${CHANNEL_ICONS[channel]}"></i> ${esc(t(`THRESHOLD.Channel.${channel}`))}`;
}

/** A stacked label + control. `label` may contain trusted markup (icons). */
function field(label, control, cls = "") {
  return `<div class="thr-field ${cls}"><label>${label}</label>${control}</div>`;
}

function section(id, icon, title, extra, body) {
  return `<details class="thr-section" data-thr-section="${id}">
      <summary><i class="${icon}"></i> <span class="thr-section-title">${esc(title)}</span> ${extra}</summary>
      <div class="thr-section-body">${body}</div>
    </details>`;
}

/** CSS version of the durability bar colour (see durability-bars.js). */
export function integrityColor(ratio) {
  return `#${integrityColorNumber(ratio).toString(16).padStart(6, "0")}`;
}

/** Restrictiveness of a value within its channel: blocked, partial or open. */
function level(channel, value) {
  const values = CHANNEL_VALUES[channel];
  const openness = values.indexOf(value) / (values.length - 1);
  return openness <= 0 ? "blocked" : openness >= 1 ? "open" : "partial";
}

/**
 * Adds a "Threshold" tab to Foundry's wall configuration sheet. The tab's inputs are
 * ordinary named form fields under flags.threshold.ui, so the sheet submits them in its
 * own update; the preUpdateWall hook (see wall-form.js) turns them into the barrier.
 */
export class WallConfigTab {
  constructor({ profiles, syncEnabled }) {
    this.profiles = profiles;
    this.syncEnabled = syncEnabled;
  }

  profileLabel(id) {
    const custom = this.profiles.get(id)?.label;
    if (custom) return t(custom);
    const key = `THRESHOLD.Profile.${id}`;
    return game.i18n.has?.(key) ? t(key) : id;
  }

  materialLabel(id) {
    const label = this.profiles.getMaterial(id)?.label;
    return label ? t(label) : id;
  }

  /** renderWallConfig hook handler. Safe to call again on every re-render. */
  inject(app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const document = app.document ?? app.object;
    if (!root || !document || !game.user?.isGM) return;
    const content = root.querySelector(".window-content") ?? root;
    const form = root.tagName === "FORM" ? content : content.querySelector("form") ?? content;
    if (HelperWalls.isHelper(document)) {
      if (!form.querySelector(".thr-helper-notice")) {
        const note = window.document.createElement("p");
        note.className = "thr-helper-notice notification warning";
        note.textContent = t("THRESHOLD.Config.HelperNotice");
        form.prepend(note);
      }
      return;
    }
    form.classList.add("thr-tabbed");
    const stored = document.getFlag(MODULE_ID, FLAG_KEY);
    const [x0, y0, x1, y1] = stored?.geometry?.closedC ?? document.c ?? [0, 0, 0, 0];
    const gridSize = globalThis.canvas?.grid?.size ?? globalThis.canvas?.scene?.grid?.size ?? 100;
    this.wallLength = Math.hypot(x1 - x0, y1 - y0) / gridSize;

    // Undo a previous injection, then build afresh from the current document.
    form.querySelector(":scope > .thr-tabs")?.remove();
    form.querySelector(":scope > .thr-panel")?.remove();
    const oldWrapper = form.querySelector(":scope > .thr-wall-tab");
    if (oldWrapper) oldWrapper.replaceWith(...oldWrapper.childNodes);

    const footer = [...form.children].find(el => el.matches("footer, .form-footer, .sheet-footer"));
    const wallTab = window.document.createElement("div");
    wallTab.className = "thr-wall-tab";
    wallTab.dataset.thrTab = "wall";
    for (const child of [...form.children]) if (child !== footer) wallTab.append(child);

    const nav = window.document.createElement("nav");
    nav.className = "thr-tabs tabs";
    nav.innerHTML = `<a data-thr-tab="wall"><i class="fa-solid fa-block-brick"></i> ${esc(t("THRESHOLD.Config.WallTab"))}</a>`
      + `<a data-thr-tab="threshold"><i class="fa-solid fa-dungeon"></i> ${esc(t("THRESHOLD.Config.Tab"))}</a>`;

    const panel = window.document.createElement("div");
    panel.className = "thr-panel";
    panel.dataset.thrTab = "threshold";
    panel.innerHTML = this.renderPanel(document.getFlag(MODULE_ID, FLAG_KEY) ?? null);

    for (const el of [nav, wallTab, panel]) form.insertBefore(el, footer ?? null);

    const notice = window.document.createElement("p");
    notice.className = "thr-managed-notice notification info";
    wallTab.prepend(notice);

    const activate = tab => {
      app._thresholdTab = tab;
      for (const el of form.querySelectorAll(":scope > [data-thr-tab]")) el.classList.toggle("active", el.dataset.thrTab === tab);
      for (const a of nav.querySelectorAll("a")) a.classList.toggle("active", a.dataset.thrTab === tab);
      app.setPosition?.({ height: "auto" });
    };
    nav.addEventListener("click", event => {
      const link = event.target.closest("[data-thr-tab]");
      if (link) { event.preventDefault(); activate(link.dataset.thrTab); }
    });

    const existing = document.getFlag(MODULE_ID, FLAG_KEY) ?? null;
    app._thresholdSections ??= { channels: true, states: false, material: false };
    for (const details of panel.querySelectorAll("details[data-thr-section]")) {
      details.open = Boolean(app._thresholdSections[details.dataset.thrSection]);
    }
    // toggle does not bubble, so listen in the capture phase.
    panel.addEventListener("toggle", event => {
      const section = event.target.dataset?.thrSection;
      if (section) app._thresholdSections[section] = event.target.open;
    }, true);

    const openSection = section => {
      const details = panel.querySelector(`details[data-thr-section="${section}"]`);
      if (details && !details.open) details.open = true;
      details?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    panel.addEventListener("click", event => {
      const stateLink = event.target.closest("[data-thr-state]");
      if (stateLink && !stateLink.classList.contains("disabled")) {
        event.preventDefault();
        const state = stateLink.dataset.thrState;
        if (state === "closed") {
          openSection("channels");
          return;
        }
        app._thresholdOverrideState = state;
        this.showOverrideState(panel, state);
        // Clicks in the matrix also bring the editor into view.
        if (stateLink.closest(".thr-matrix")) openSection("states");
        return;
      }
      const swatch = event.target.closest("[data-thr-texture]");
      if (swatch) {
        event.preventDefault();
        this.setField(panel, "appearance.texture", swatch.dataset.thrTexture);
        this.refresh(panel, form, notice, existing);
        return;
      }
      const browse = event.target.closest("[data-thr-browse]");
      if (browse) {
        event.preventDefault();
        browseImage(panel.querySelector(`[name="${browse.dataset.thrBrowse}"]`));
        return;
      }
      const reset = event.target.closest("[data-thr-reset]");
      if (reset) {
        event.preventDefault();
        for (const c of CHANNELS) this.setField(panel, `stateOverrides.${reset.dataset.thrReset}.${c}`, "");
        this.setField(panel, `appearance.stateTextures.${reset.dataset.thrReset}.mode`, "inherit");
        this.refresh(panel, form, notice, existing);
      }
    });
    panel.addEventListener("input", event => {
      if (event.target.type === "range") this.refresh(panel, form, notice, existing);
    });
    panel.addEventListener("change", event => {
      const name = event.target.name ?? "";
      if (name === `${UI_PREFIX}.profile`) this.fillFromProfile(panel, event.target.value, existing);
      if (name === `${UI_PREFIX}.material.id`) this.fillMaterial(panel, event.target.value);
      this.autofillThreshold(panel, name, event.target.value);
      this.refresh(panel, form, notice, existing);
    });
    this.showOverrideState(panel, app._thresholdOverrideState ?? "open");
    this.refresh(panel, form, notice, existing);
    // Walls that already have a profile open on the Threshold tab.
    activate(app._thresholdTab ?? (existing ? "threshold" : "wall"));
  }

  renderPanel(barrier) {
    const profileId = barrier?.profile ?? "";
    const b = barrier ?? makeBarrier();
    const P = UI_PREFIX;
    const ids = this.profiles.list();
    if (profileId && !ids.includes(profileId)) ids.unshift(profileId);

    const profileSelect = `<select name="${P}.profile">${option("", t("THRESHOLD.Config.ProfileNone"), profileId)}`
      + ids.map(id => option(id, this.profileLabel(id), profileId)).join("") + "</select>";
    const stateSelect = `<select name="${P}.state">${STATES.map(s => option(s, t(`THRESHOLD.State.${s}`), b.state)).join("")}</select>`;
    const doorSelect = `<select name="${P}.interaction.door">${DOOR_MODES.map(m => option(m, t(`THRESHOLD.DoorMode.${m}`), b.interaction?.door ?? "none")).join("")}</select>`;

    const channelFields = CHANNELS.map(c => field(
      channelLabel(c),
      `<select name="${P}.channels.${c}">${CHANNEL_VALUES[c].map(v => option(v, t(`THRESHOLD.Value.${v}`), b.channels[c])).join("")}</select>`
    )).join("");

    const thresholdFields = THRESHOLD_CHANNELS.map(c => field(
      channelLabel(c),
      `<input type="number" min="0" step="0.5" name="${P}.thresholds.${c}" value="${esc(b.thresholds?.[c] ?? "")}" placeholder="—">`
        + `<span class="thr-unit" data-thr-unit="${c}"></span>`,
      "thr-threshold"
    )).join("");

    const materials = this.profiles.listMaterials();
    const materialSelect = `<select name="${P}.material.id">${materials.map(m => option(m, this.materialLabel(m), b.material?.id)).join("")}</select>`;
    const durability = `<input type="number" min="0" name="${P}.material.durability" value="${esc(b.material?.durability ?? "")}" placeholder="—">`;
    const current = `<input type="number" min="0" name="${P}.integrity.current" value="${esc(b.integrity?.current ?? "")}" placeholder="—">`;
    const check = (name, label) => `<label class="thr-check"><input type="checkbox" name="${P}.${name}"${getPath(b, name) ? " checked" : ""}> ${esc(label)}</label>`;

    return `
      <div class="thr-hero">
        ${field(t("THRESHOLD.Config.Profile"), profileSelect, "thr-profile")}
        <div class="thr-grid thr-grid-2">
          ${field(t("THRESHOLD.Config.Door"), doorSelect)}
          ${field(t("THRESHOLD.Config.State"), stateSelect)}
        </div>
        <div class="thr-matrix"></div>
      </div>
      <div class="thr-body">
        ${section("channels", "fa-solid fa-sliders", t("THRESHOLD.Config.Channels"), `<span class="thr-note">${esc(t("THRESHOLD.State.closed"))}</span>`, `
          <p class="hint">${esc(t("THRESHOLD.Config.ChannelsHint"))}</p>
          <div class="thr-grid thr-grid-2">${channelFields}</div>
          <h4 class="thr-subhead">${esc(t("THRESHOLD.Config.Thresholds"))}</h4>
          <div class="thr-grid thr-grid-3">${thresholdFields}</div>
          <p class="hint">${esc(t("THRESHOLD.Config.ThresholdsHint"))}</p>
          ${check("thresholds.attenuation", t("THRESHOLD.Config.Attenuation"))}
          <p class="hint">${esc(t("THRESHOLD.Config.AttenuationHint"))}</p>`)}
        ${section("geometry", "fa-solid fa-door-open", t("THRESHOLD.Config.GeometryLegend"), `<span class="thr-note" data-thr-geometry-summary></span>`, this.renderGeometry(b))}
        ${section("states", "fa-solid fa-code-branch", t("THRESHOLD.Config.OverridesLegend"), `<span class="thr-badge" data-thr-override-count></span>`, this.renderOverrides(b))}
        ${section("appearance", "fa-solid fa-palette", t("THRESHOLD.Config.AppearanceLegend"), `<img class="thr-summary-texture" data-thr-texture-summary alt="">`, this.renderAppearance(b))}
        ${section("material", "fa-solid fa-cubes", t("THRESHOLD.Config.MaterialLegend"), `<span class="thr-note" data-thr-material-summary></span>`, `
          ${field(t("THRESHOLD.Config.Material"), materialSelect)}
          <div class="thr-grid thr-grid-2">
            ${field(t("THRESHOLD.Config.CurrentDurability"), current)}
            ${field(t("THRESHOLD.Config.Durability"), durability)}
          </div>
          <div class="thr-integrity" data-thr-integrity></div>
          <div class="thr-checks">
            ${check("interaction.playersCanOperate", t("THRESHOLD.Config.playersCanOperate"))}
            ${check("interaction.lockable", t("THRESHOLD.Config.lockable"))}
            ${check("interaction.destructible", t("THRESHOLD.Config.destructible"))}
          </div>`)}
      </div>`;
  }

  renderGeometry(b) {
    const P = `${UI_PREFIX}.geometry`;
    const g = b.geometry ?? {};
    const percent = Math.round((g.openFraction ?? 0.33) * 100);
    return `
      <label class="thr-check"><input type="checkbox" name="${P}.physical"${g.mode === "physical" ? " checked" : ""}> ${esc(t("THRESHOLD.Config.Physical"))}</label>
      <p class="hint">${esc(t("THRESHOLD.Config.PhysicalHint"))}</p>
      <p class="hint"><i class="fa-solid fa-computer-mouse"></i> ${esc(t("THRESHOLD.Config.WheelHint"))}</p>
      <div class="thr-geometry-body">
        <div class="thr-schematic" data-thr-schematic></div>
        ${field(t("THRESHOLD.Config.OpenAmount"), `<div class="thr-range"><input type="range" min="0" max="100" step="5" name="${P}.openPercent" value="${percent}"><span data-thr-open-label></span></div>`)}
        <div class="thr-grid thr-grid-2">
          ${field(t("THRESHOLD.Config.Hinge"), `<select name="${P}.hinge">${["a", "b"].map(h => option(h, t(`THRESHOLD.Config.HingeEnd.${h}`), g.hinge ?? "a")).join("")}</select>`)}
          <div data-thr-swing-only>${field(t("THRESHOLD.Config.Swing"), `<select name="${P}.swing">${[1, -1].map(v => option(String(v), t(`THRESHOLD.Config.SwingDir.${v === 1 ? "cw" : "ccw"}`), String(g.swing ?? 1))).join("")}</select>`)}</div>
        </div>
        ${field(t("THRESHOLD.Config.PassableGap"), `<input type="number" min="0" step="0.25" name="${P}.passableGap" value="${esc(g.passableGap ?? 1)}">`)}
        <p class="hint" data-thr-gap-status></p>
      </div>`;
  }

  /** Schematic of the door: closed position dashed, leaf when ajar, gap and helper wall. */
  refreshGeometry(panel, ui, isDoor) {
    const details = panel.querySelector('details[data-thr-section="geometry"]');
    details.hidden = !isDoor;
    if (!isDoor) return;
    const g = ui.geometry ?? {};
    const physical = Boolean(g.physical);
    const fraction = Math.min(1, Math.max(0, Number(g.openPercent ?? 33) / 100));
    const motion = ui.appearance?.animation === "slide" ? "slide" : "swing";
    const hinge = g.hinge === "b" ? "b" : "a";
    const swing = Number(g.swing) === -1 ? -1 : 1;
    panel.querySelector(".thr-geometry-body").classList.toggle("thr-disabled", !physical);
    panel.querySelector("[data-thr-swing-only]").hidden = motion === "slide";

    const label = motion === "slide"
      ? game.i18n.format("THRESHOLD.Config.OpenSlide", { percent: Math.round(fraction * 100) })
      : game.i18n.format("THRESHOLD.Config.OpenSwing", { degrees: Math.round(GeometryEngine.swingAngle(fraction)) });
    panel.querySelector("[data-thr-open-label]").textContent = label;
    panel.querySelector("[data-thr-geometry-summary]").textContent = physical ? label : t("THRESHOLD.Config.Approximate");

    // Gap in grid squares for this wall, and whether tokens can pass.
    const length = this.wallLength || 1;
    const gap = GeometryEngine.gapWidth([0, 0, length, 0], { motion, openFraction: fraction });
    const needed = Number(g.passableGap);
    const passable = Number.isFinite(needed) && gap >= needed;
    panel.querySelector("[data-thr-gap-status]").textContent = game.i18n.format(
      passable ? "THRESHOLD.Config.GapPassable" : "THRESHOLD.Config.GapBlocked",
      { gap: gap.toFixed(2), length: +length.toFixed(2) }
    );

    // Draw in a 240×190 box: an 85 px door on a wall at y = 95, so a 90° swing fits either way.
    const closed = [77, 95, 162, 95];
    const leaf = GeometryEngine.leafCoords(closed, { hinge, swing, motion, openFraction: fraction });
    const [hx, hy] = hinge === "a" ? [closed[0], closed[1]] : [closed[2], closed[3]];
    const helper = !passable;
    panel.querySelector("[data-thr-schematic]").innerHTML = `
      <svg viewBox="0 0 240 190" role="img" aria-label="${esc(label)}">
        <line x1="10" y1="95" x2="${closed[0] - 4}" y2="95" class="thr-s-wall"/><line x1="${closed[2] + 4}" y1="95" x2="230" y2="95" class="thr-s-wall"/>
        <line x1="${closed[0]}" y1="95" x2="${closed[2]}" y2="95" class="${helper ? "thr-s-helper" : "thr-s-closed"}"/>
        <line x1="${leaf[0]}" y1="${leaf[1]}" x2="${leaf[2]}" y2="${leaf[3]}" class="thr-s-leaf"/>
        <circle cx="${hx}" cy="${hy}" r="4" class="thr-s-hinge"/>
        <text x="${closed[0] - 8}" y="${swing === 1 ? 84 : 112}" class="thr-s-label" text-anchor="end">A</text>
        <text x="${closed[2] + 8}" y="${swing === 1 ? 84 : 112}" class="thr-s-label">B</text>
      </svg>
      <p class="thr-legend"><span class="thr-s-key thr-s-leaf"></span>${esc(t("THRESHOLD.Config.LegendLeaf"))}
        <span class="thr-s-key ${helper ? "thr-s-helper" : "thr-s-closed"}"></span>${esc(t(helper ? "THRESHOLD.Config.LegendHelper" : "THRESHOLD.Config.LegendClosed"))}</p>`;
  }

  textureInput(name, value) {
    return `<div class="thr-path"><input type="text" name="${name}" value="${esc(value ?? "")}" placeholder="${esc(t("THRESHOLD.Config.TextureNone"))}">`
      + `<button type="button" class="thr-browse" data-thr-browse="${name}" title="${esc(t("THRESHOLD.Config.Browse"))}"><i class="fa-solid fa-file-import"></i></button></div>`;
  }

  renderAppearance(b) {
    const P = `${UI_PREFIX}.appearance`;
    const a = b.appearance ?? {};
    const swatches = `<button type="button" class="thr-swatch thr-swatch-none" data-thr-texture="" title="${esc(t("THRESHOLD.Config.TextureNone"))}"><i class="fa-solid fa-ban"></i></button>`
      + BUNDLED_TEXTURES.map(tex => `<button type="button" class="thr-swatch" data-thr-texture="${esc(tex.src)}" title="${esc(tex.id)}"><img src="${esc(tex.src)}" alt=""></button>`).join("");
    const animation = `<select name="${P}.animation">${DOOR_ANIMATIONS.map(v => option(v, t(`THRESHOLD.Animation.${v}`), a.animation ?? "swing")).join("")}</select>`;
    return `
      <p class="hint">${esc(t("THRESHOLD.Config.AppearanceHint"))}</p>
      <div class="thr-preview-strip" data-thr-texture-preview></div>
      ${field(t("THRESHOLD.Config.Texture"), this.textureInput(`${P}.texture`, a.texture))}
      <div class="thr-swatches">${swatches}</div>
      <div class="thr-grid thr-grid-2" data-thr-door-only>
        ${field(t("THRESHOLD.Config.DoorAnimation"), animation)}
        <div class="thr-field"><label>&nbsp;</label><label class="thr-check"><input type="checkbox" name="${P}.double"${a.double ? " checked" : ""}> ${esc(t("THRESHOLD.Config.DoubleDoor"))}</label></div>
      </div>
      <div class="thr-grid thr-grid-2" data-thr-drawn-only>
        ${field(t("THRESHOLD.Config.Thickness"), `<input type="number" min="0.01" max="2" step="0.01" name="${P}.thickness" value="${esc(a.thickness ?? 0.07)}">`)}
        <div class="thr-field"><label>&nbsp;</label><label class="thr-check"><input type="checkbox" name="${P}.repeat"${a.repeat !== false ? " checked" : ""}> ${esc(t("THRESHOLD.Config.Repeat"))}</label></div>
      </div>
      <p class="hint" data-thr-door-only>${esc(t("THRESHOLD.Config.DoorAppearanceHint"))}</p>`;
  }

  renderStateTexture(b, state) {
    const P = `${UI_PREFIX}.appearance.stateTextures.${state}`;
    const value = b.appearance?.stateTextures?.[state];
    const mode = value === null || value === undefined ? "inherit" : value === "" ? "none" : "custom";
    const modeSelect = `<select name="${P}.mode">${["inherit", "none", "custom"].map(m => option(m, t(`THRESHOLD.Config.StateTexture.${m}`), mode)).join("")}</select>`;
    return `<div class="thr-state-texture" data-thr-state-texture="${state}">
        ${field(`<i class="fa-solid fa-palette"></i> ${esc(t("THRESHOLD.Config.StateTextureLabel"))}`, modeSelect)}
        <div data-thr-custom-texture>${this.textureInput(`${P}.path`, mode === "custom" ? value : "")}</div>
      </div>`;
  }

  /** Show/hide appearance fields for doors vs. drawn barriers and update previews. */
  refreshAppearance(panel, ui, isDoor) {
    for (const el of panel.querySelectorAll("[data-thr-door-only]")) el.hidden = !isDoor;
    for (const el of panel.querySelectorAll("[data-thr-drawn-only]")) el.hidden = isDoor;
    const texture = ui.appearance?.texture || "";
    for (const sw of panel.querySelectorAll("[data-thr-texture]")) sw.classList.toggle("active", sw.dataset.thrTexture === texture);
    const summary = panel.querySelector("[data-thr-texture-summary]");
    summary.hidden = !texture;
    if (texture) summary.src = texture;
    const strip = panel.querySelector("[data-thr-texture-preview]");
    strip.innerHTML = texture ? `<img src="${esc(texture)}" alt="">` : `<span>${esc(t("THRESHOLD.Config.TextureNone"))}</span>`;
    for (const group of panel.querySelectorAll("[data-thr-state-texture]")) {
      const mode = group.querySelector("select").value;
      group.querySelector("[data-thr-custom-texture]").hidden = mode !== "custom";
    }
  }

  /**
   * One group of channel selects per overridable state; only the active group is shown,
   * but all of them are submitted. An empty value means "no override".
   */
  renderOverrides(b) {
    const P = `${UI_PREFIX}.stateOverrides`;
    const nav = OVERRIDE_STATES.map(s => `<a data-thr-state="${s}">${esc(t(`THRESHOLD.State.${s}`))}</a>`).join("");
    const groups = OVERRIDE_STATES.map(state => {
      const override = b.stateOverrides?.[state] ?? {};
      const fields = CHANNELS.map(c => field(
        channelLabel(c),
        `<select name="${P}.${state}.${c}">${option("", t("THRESHOLD.Config.Default"), override[c] ?? "")}`
          + CHANNEL_VALUES[c].map(v => option(v, t(`THRESHOLD.Value.${v}`), override[c] ?? "")).join("") + "</select>"
      )).join("");
      return `<div class="thr-override-group" data-thr-state-group="${state}">
          <p class="hint">${esc(t(`THRESHOLD.Config.OverrideHint.${state}`))}</p>
          <div class="thr-grid thr-grid-2">${fields}</div>
          ${this.renderStateTexture(b, state)}
          <button type="button" class="thr-reset" data-thr-reset="${state}"><i class="fa-solid fa-rotate-left"></i> ${esc(t("THRESHOLD.Config.ResetState"))}</button>
        </div>`;
    }).join("");
    return `<p class="hint">${esc(t("THRESHOLD.Config.OverridesHint"))}</p>
      <nav class="thr-state-tabs">${nav}</nav>
      ${groups}`;
  }

  showOverrideState(panel, state) {
    for (const el of panel.querySelectorAll("[data-thr-state-group]")) el.classList.toggle("active", el.dataset.thrStateGroup === state);
    for (const a of panel.querySelectorAll(".thr-state-tabs [data-thr-state]")) a.classList.toggle("active", a.dataset.thrState === state);
    for (const th of panel.querySelectorAll(".thr-matrix [data-thr-state]")) th.classList.toggle("editing", th.dataset.thrState === state);
  }

  /**
   * Label each "Default" option with what the state gives without an override, from the
   * base channels currently in the form, and mark states that have overrides.
   */
  refreshOverrides(panel, ui, isDoor) {
    const channels = { ...makeBarrier().channels };
    for (const c of CHANNELS) if (CHANNEL_VALUES[c].includes(ui.channels?.[c])) channels[c] = ui.channels[c];
    let count = 0;
    for (const state of OVERRIDE_STATES) {
      const fallback = PropertyEngine.effectiveChannels({ enabled: true, channels, state, stateOverrides: {} });
      let overridden = false;
      for (const c of CHANNELS) {
        const select = panel.querySelector(`[name="${UI_PREFIX}.stateOverrides.${state}.${c}"]`);
        if (!select) continue;
        select.options[0].textContent = game.i18n.format("THRESHOLD.Config.DefaultValue", { value: t(`THRESHOLD.Value.${fallback[c]}`) });
        select.classList.toggle("thr-overridden", Boolean(select.value));
        if (select.value) overridden = true;
      }
      if (overridden) count++;
      const link = panel.querySelector(`.thr-state-tabs [data-thr-state="${state}"]`);
      link.classList.toggle("thr-has-override", overridden);
      const unavailable = !isDoor && DOOR_ONLY_STATES.includes(state);
      link.classList.toggle("disabled", unavailable);
      link.title = unavailable ? t("THRESHOLD.Config.DoorOnlyState") : "";
    }
    const badge = panel.querySelector("[data-thr-override-count]");
    badge.textContent = count ? game.i18n.format("THRESHOLD.Config.OverrideCount", { count }) : "";
    badge.hidden = !count;
    // Do not leave a door-only state open when the barrier is no longer a door.
    const active = panel.querySelector(".thr-state-tabs [data-thr-state].active");
    if (active?.classList.contains("disabled")) this.showOverrideState(panel, "open");
  }

  /** Read the tab back into the same shape the sheet will submit. */
  readPanel(panel) {
    const ui = {};
    for (const el of panel.querySelectorAll(`[name^="${UI_PREFIX}."]`)) {
      const value = el.type === "checkbox" ? el.checked : el.value;
      foundry.utils.setProperty(ui, el.name.slice(UI_PREFIX.length + 1), value);
    }
    return ui;
  }

  setField(panel, path, value) {
    const el = panel.querySelector(`[name="${UI_PREFIX}.${path}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
  }

  fillFromProfile(panel, profileId, existing) {
    if (!profileId) return;
    const b = existing?.profile === profileId ? existing : makeBarrier(this.profiles.resolve(profileId));
    this.setField(panel, "interaction.door", b.interaction.door);
    this.setField(panel, "state", b.state);
    for (const c of CHANNELS) this.setField(panel, `channels.${c}`, b.channels[c]);
    for (const c of THRESHOLD_CHANNELS) this.setField(panel, `thresholds.${c}`, b.thresholds[c]);
    this.setField(panel, "thresholds.attenuation", b.thresholds.attenuation);
    this.setField(panel, "material.id", b.material.id);
    this.setField(panel, "material.durability", b.material.durability);
    this.setField(panel, "integrity.current", b.integrity?.current ?? null);
    for (const k of ["playersCanOperate", "lockable", "destructible"]) this.setField(panel, `interaction.${k}`, b.interaction[k]);
    for (const state of OVERRIDE_STATES) {
      for (const c of CHANNELS) this.setField(panel, `stateOverrides.${state}.${c}`, b.stateOverrides?.[state]?.[c] ?? "");
      const tex = b.appearance?.stateTextures?.[state];
      this.setField(panel, `appearance.stateTextures.${state}.mode`, tex === null || tex === undefined ? "inherit" : tex === "" ? "none" : "custom");
      this.setField(panel, `appearance.stateTextures.${state}.path`, tex || "");
    }
    const a = b.appearance ?? {};
    this.setField(panel, "appearance.texture", a.texture ?? "");
    this.setField(panel, "appearance.animation", a.animation ?? "swing");
    this.setField(panel, "appearance.double", a.double);
    this.setField(panel, "appearance.thickness", a.thickness ?? 0.07);
    this.setField(panel, "appearance.repeat", a.repeat !== false);
    const g = b.geometry ?? {};
    this.setField(panel, "geometry.physical", g.mode === "physical");
    this.setField(panel, "geometry.openPercent", Math.round((g.openFraction ?? 0.33) * 100));
    this.setField(panel, "geometry.hinge", g.hinge ?? "a");
    this.setField(panel, "geometry.swing", String(g.swing ?? 1));
    this.setField(panel, "geometry.passableGap", g.passableGap ?? 1);
  }

  /** Switching a channel to Proximity/Distance with no range set fills in 1 grid square. */
  autofillThreshold(panel, name, value) {
    if (!["proximity", "distance"].includes(value)) return;
    const channel = name.split(".").pop();
    if (!THRESHOLD_CHANNELS.includes(channel)) return;
    const input = panel.querySelector(`[name="${UI_PREFIX}.thresholds.${channel}"]`);
    if (input && input.value === "") input.value = 1;
  }

  fillMaterial(panel, materialId) {
    this.setField(panel, "material.durability", this.profiles.getMaterial(materialId)?.durability ?? null);
    this.setField(panel, "integrity.current", null);
  }

  refresh(panel, form, notice, existing) {
    const ui = this.readPanel(panel);
    const active = Boolean(ui.profile);
    const sync = this.syncEnabled();
    panel.querySelector(".thr-body").classList.toggle("thr-disabled", !active);
    panel.querySelector(".thr-body").inert = !active;
    for (const el of panel.querySelectorAll(`[name^="${UI_PREFIX}."]`)) {
      if (el.name !== `${UI_PREFIX}.profile`) el.disabled = !active;
    }

    // ajar and locked only make sense for doors.
    const isDoor = ui.interaction?.door && ui.interaction.door !== "none";
    const stateSelect = panel.querySelector(`[name="${UI_PREFIX}.state"]`);
    for (const opt of stateSelect.options) {
      if (["ajar", "locked"].includes(opt.value)) opt.disabled = !isDoor;
    }
    if (!isDoor && ["ajar", "locked"].includes(stateSelect.value)) stateSelect.value = "closed";

    // While a profile is active Threshold owns the native restriction fields.
    const removing = !active && existing;
    for (const el of form.querySelectorAll(NATIVE_SELECTOR)) {
      el.disabled = sync && (active || removing);
      el.closest(".form-group")?.classList.toggle("thr-managed", el.disabled);
    }
    notice.hidden = !(active || removing);
    notice.textContent = !sync ? t("THRESHOLD.Config.MetadataOnly")
      : active ? game.i18n.format("THRESHOLD.Config.ManagedNotice", { profile: this.profileLabel(ui.profile) })
      : t("THRESHOLD.Config.RemoveNotice");

    this.refreshOverrides(panel, ui, isDoor);
    this.renderMatrix(panel.querySelector(".thr-matrix"), ui, existing, isDoor);
    const integrity = this.formIntegrity(ui);
    panel.querySelector("[data-thr-material-summary]").textContent = active
      ? [this.materialLabel(ui.material?.id), integrity ? `${integrity.current}/${integrity.max}` : null].filter(Boolean).join(" · ")
      : "";
    this.renderIntegrity(panel.querySelector("[data-thr-integrity]"), integrity);
    this.refreshThresholds(panel, ui);
    this.refreshAppearance(panel, ui, isDoor);
    this.refreshGeometry(panel, ui, isDoor);
  }

  /**
   * Read-only overview: what each channel does in every state, with the current state
   * highlighted and overridden cells marked. Clicking a state opens it for editing.
   */
  /** Durability as currently typed in the form. */
  formIntegrity(ui) {
    const max = ui.material?.durability === "" ? null : Number(ui.material?.durability);
    const raw = ui.integrity?.current;
    return PropertyEngine.integrity({
      material: { durability: Number.isFinite(max) ? max : null },
      integrity: { current: raw === "" || raw == null ? null : Number(raw) }
    });
  }

  renderIntegrity(target, integrity) {
    if (!integrity) {
      target.innerHTML = `<p class="hint">${esc(t("THRESHOLD.Config.NoDurability"))}</p>`;
      return;
    }
    const pct = Math.round(integrity.ratio * 100);
    target.innerHTML = `<div class="thr-bar" title="${integrity.current} / ${integrity.max}">`
      + `<div class="thr-bar-fill" style="width:${pct}%; background:${integrityColor(integrity.ratio)}"></div>`
      + `<span>${integrity.current} / ${integrity.max}</span></div>`
      + `<p class="hint">${esc(t("THRESHOLD.Config.DurabilityHint"))}</p>`;
  }

  /**
   * Show each proximity range in scene units, and flag ranges that no channel uses
   * (or that a proximity channel is missing).
   */
  refreshThresholds(panel, ui) {
    const grid = globalThis.canvas?.scene?.grid;
    const distance = grid?.distance ?? 1;
    const units = grid?.units ?? "";
    for (const c of THRESHOLD_CHANNELS) {
      const values = [ui.channels?.[c], ...OVERRIDE_STATES.map(s => ui.stateOverrides?.[s]?.[c])];
      const used = values.some(v => v === "proximity" || v === "distance");
      const raw = ui.thresholds?.[c];
      const grids = raw === "" || raw == null ? null : Number(raw);
      const unit = panel.querySelector(`[data-thr-unit="${c}"]`);
      const fieldEl = unit.closest(".thr-field");
      fieldEl.classList.toggle("thr-unused", !used);
      fieldEl.classList.toggle("thr-missing", used && grids === null);
      unit.textContent = !used ? t("THRESHOLD.Config.ThresholdUnused")
        : grids === null ? t("THRESHOLD.Config.ThresholdMissing")
        : `= ${+(grids * distance).toFixed(2)} ${units}`.trim();
    }
  }

  renderMatrix(target, ui, existing, isDoor) {
    if (!ui.profile) {
      target.innerHTML = `<p class="hint thr-empty"><i class="fa-solid fa-circle-info"></i> ${esc(t("THRESHOLD.Config.PreviewNone"))}</p>`;
      return;
    }
    let barrier;
    try {
      barrier = barrierFromForm(foundry.utils.deepClone(ui), existing, this.profiles);
    } catch (err) {
      target.innerHTML = `<p class="thr-error">${esc(err.message)}</p>`;
      return;
    }
    const editing = target.closest(".thr-panel")?.querySelector(".thr-state-tabs .active")?.dataset.thrState;
    const head = MATRIX_STATES.map(state => {
      const unavailable = !isDoor && DOOR_ONLY_STATES.includes(state);
      const cls = [state === barrier.state ? "current" : "", state === editing ? "editing" : "", unavailable ? "disabled" : ""].join(" ");
      const title = `${t(`THRESHOLD.State.${state}`)} — ${t("THRESHOLD.Config.MatrixEdit")}`;
      return `<th class="${cls}" data-thr-state="${state}" title="${esc(title)}">${esc(t(`THRESHOLD.StateShort.${state}`))}</th>`;
    }).join("");
    const rows = CHANNELS.map(c => {
      const cells = MATRIX_STATES.map(state => {
        if (!isDoor && DOOR_ONLY_STATES.includes(state)) return `<td class="na">—</td>`;
        const value = PropertyEngine.effectiveChannels({ ...barrier, state })[c];
        const overridden = barrier.stateOverrides?.[state]?.[c] != null;
        const title = `${t(`THRESHOLD.Channel.${c}`)}: ${t(`THRESHOLD.Value.${value}`)}`;
        return `<td class="thr-${level(c, value)}${state === barrier.state ? " current" : ""}${overridden ? " overridden" : ""}" title="${esc(title)}">${esc(t(`THRESHOLD.ValueShort.${value}`))}</td>`;
      }).join("");
      return `<tr><th scope="row" title="${esc(t(`THRESHOLD.Channel.${c}`))}"><i class="${CHANNEL_ICONS[c]}"></i></th>${cells}</tr>`;
    }).join("");
    target.innerHTML = `
      <table>
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="thr-legend">
        <span class="thr-key thr-blocked"></span>${esc(t("THRESHOLD.Config.LegendBlocked"))}
        <span class="thr-key thr-partial"></span>${esc(t("THRESHOLD.Config.LegendPartial"))}
        <span class="thr-key thr-open"></span>${esc(t("THRESHOLD.Config.LegendOpen"))}
        <span class="thr-dot"></span>${esc(t("THRESHOLD.Config.LegendOverride"))}
      </p>`;
  }
}

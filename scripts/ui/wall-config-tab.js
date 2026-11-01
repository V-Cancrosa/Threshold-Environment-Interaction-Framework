import { CHANNELS, CHANNEL_VALUES, DOOR_MODES, FLAG_KEY, MODULE_ID, STATES, THRESHOLD_CHANNELS } from "../core/constants.js";
import { makeBarrier } from "../core/defaults.js";
import { PropertyEngine } from "../properties/property-engine.js";
import { UI_PREFIX, barrierFromForm } from "./wall-form.js";

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

function group(label, control, hint = "") {
  return `<div class="form-group"><label>${esc(label)}</label><div class="form-fields">${control}</div>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
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
    panel.addEventListener("click", event => {
      const stateLink = event.target.closest("[data-thr-state]");
      if (stateLink && !stateLink.classList.contains("disabled")) {
        event.preventDefault();
        app._thresholdOverrideState = stateLink.dataset.thrState;
        this.showOverrideState(panel, stateLink.dataset.thrState);
        app.setPosition?.({ height: "auto" });
        return;
      }
      const reset = event.target.closest("[data-thr-reset]");
      if (reset) {
        event.preventDefault();
        for (const c of CHANNELS) this.setField(panel, `stateOverrides.${reset.dataset.thrReset}.${c}`, "");
        this.refresh(panel, form, notice, existing);
      }
    });
    panel.addEventListener("change", event => {
      const name = event.target.name ?? "";
      if (name === `${UI_PREFIX}.profile`) this.fillFromProfile(panel, event.target.value, existing);
      if (name === `${UI_PREFIX}.material.id`) this.fillMaterial(panel, event.target.value);
      this.refresh(panel, form, notice, existing);
    });
    this.showOverrideState(panel, app._thresholdOverrideState ?? "open");
    this.refresh(panel, form, notice, existing);
    activate(app._thresholdTab ?? "wall");
  }

  renderPanel(barrier) {
    const profileId = barrier?.profile ?? "";
    const b = barrier ?? makeBarrier();
    const P = `${UI_PREFIX}`;
    const ids = this.profiles.list();
    if (profileId && !ids.includes(profileId)) ids.unshift(profileId);

    const profileSelect = `<select name="${P}.profile">${option("", t("THRESHOLD.Config.ProfileNone"), profileId)}`
      + ids.map(id => option(id, this.profileLabel(id), profileId)).join("") + "</select>";
    const stateSelect = `<select name="${P}.state">${STATES.map(s => option(s, t(`THRESHOLD.State.${s}`), b.state)).join("")}</select>`;
    const doorSelect = `<select name="${P}.interaction.door">${DOOR_MODES.map(m => option(m, t(`THRESHOLD.DoorMode.${m}`), b.interaction?.door ?? "none")).join("")}</select>`;

    const channelRows = CHANNELS.map(c => group(
      t(`THRESHOLD.Channel.${c}`),
      `<select name="${P}.channels.${c}">${CHANNEL_VALUES[c].map(v => option(v, t(`THRESHOLD.Value.${v}`), b.channels[c])).join("")}</select>`
    )).join("");

    const thresholdInputs = THRESHOLD_CHANNELS.map(c =>
      `<label class="thr-inline">${esc(t(`THRESHOLD.Channel.${c}`))}<input type="number" min="0" step="0.5" name="${P}.thresholds.${c}" value="${esc(b.thresholds?.[c] ?? "")}" placeholder="—"></label>`
    ).join("");

    const materials = this.profiles.listMaterials();
    const materialSelect = `<select name="${P}.material.id">${materials.map(m => option(m, this.materialLabel(m), b.material?.id)).join("")}</select>`;
    const durability = `<input type="number" min="0" name="${P}.material.durability" value="${esc(b.material?.durability ?? "")}" placeholder="—">`;

    const check = key => `<label class="thr-inline"><input type="checkbox" name="${P}.interaction.${key}"${b.interaction?.[key] ? " checked" : ""}> ${esc(t(`THRESHOLD.Config.${key}`))}</label>`;

    return `
      ${group(t("THRESHOLD.Config.Profile"), profileSelect, t("THRESHOLD.Config.ProfileHint"))}
      <div class="thr-body">
        <fieldset>
          <legend>${esc(t("THRESHOLD.Config.StateLegend"))}</legend>
          ${group(t("THRESHOLD.Config.Door"), doorSelect)}
          ${group(t("THRESHOLD.Config.State"), stateSelect)}
          <div class="thr-preview"></div>
        </fieldset>
        <fieldset>
          <legend>${esc(t("THRESHOLD.Config.Channels"))}</legend>
          <p class="hint">${esc(t("THRESHOLD.Config.ChannelsHint"))}</p>
          ${channelRows}
          ${group(t("THRESHOLD.Config.Thresholds"), thresholdInputs, t("THRESHOLD.Config.ThresholdsHint"))}
          ${group(t("THRESHOLD.Config.Attenuation"), `<input type="checkbox" name="${P}.thresholds.attenuation"${b.thresholds?.attenuation ? " checked" : ""}>`, t("THRESHOLD.Config.AttenuationHint"))}
        </fieldset>
        ${this.renderOverrides(b)}
        <fieldset>
          <legend>${esc(t("THRESHOLD.Config.MaterialLegend"))}</legend>
          ${group(t("THRESHOLD.Config.Material"), materialSelect)}
          ${group(t("THRESHOLD.Config.Durability"), durability)}
          <div class="form-group thr-checks">${check("playersCanOperate")}${check("lockable")}${check("destructible")}</div>
        </fieldset>
      </div>`;
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
      const rows = CHANNELS.map(c => group(
        t(`THRESHOLD.Channel.${c}`),
        `<select name="${P}.${state}.${c}">${option("", t("THRESHOLD.Config.Default"), override[c] ?? "")}`
          + CHANNEL_VALUES[c].map(v => option(v, t(`THRESHOLD.Value.${v}`), override[c] ?? "")).join("") + "</select>"
      )).join("");
      return `<div class="thr-override-group" data-thr-state-group="${state}">
          <p class="hint">${esc(t(`THRESHOLD.Config.OverrideHint.${state}`))}</p>
          ${rows}
          <button type="button" class="thr-reset" data-thr-reset="${state}"><i class="fa-solid fa-rotate-left"></i> ${esc(t("THRESHOLD.Config.ResetState"))}</button>
        </div>`;
    }).join("");
    return `<fieldset class="thr-overrides">
        <legend>${esc(t("THRESHOLD.Config.OverridesLegend"))}</legend>
        <p class="hint">${esc(t("THRESHOLD.Config.OverridesHint"))}</p>
        <nav class="thr-state-tabs">${nav}</nav>
        ${groups}
      </fieldset>`;
  }

  showOverrideState(panel, state) {
    for (const el of panel.querySelectorAll("[data-thr-state-group]")) el.classList.toggle("active", el.dataset.thrStateGroup === state);
    for (const a of panel.querySelectorAll("[data-thr-state]")) a.classList.toggle("active", a.dataset.thrState === state);
  }

  /**
   * Label each "Default" option with what the state gives without an override, from the
   * base channels currently in the form, and mark states that have overrides.
   */
  refreshOverrides(panel, ui, isDoor) {
    const channels = { ...makeBarrier().channels };
    for (const c of CHANNELS) if (CHANNEL_VALUES[c].includes(ui.channels?.[c])) channels[c] = ui.channels[c];
    for (const state of OVERRIDE_STATES) {
      const fallback = PropertyEngine.effectiveChannels({ enabled: true, channels, state, stateOverrides: {} });
      let overridden = false;
      for (const c of CHANNELS) {
        const select = panel.querySelector(`[name="${UI_PREFIX}.stateOverrides.${state}.${c}"]`);
        if (!select) continue;
        select.options[0].textContent = game.i18n.format("THRESHOLD.Config.DefaultValue", { value: t(`THRESHOLD.Value.${fallback[c]}`) });
        if (select.value) overridden = true;
      }
      const link = panel.querySelector(`[data-thr-state="${state}"]`);
      link.classList.toggle("thr-has-override", overridden);
      const unavailable = !isDoor && DOOR_ONLY_STATES.includes(state);
      link.classList.toggle("disabled", unavailable);
      link.title = unavailable ? t("THRESHOLD.Config.DoorOnlyState") : "";
    }
    // Do not leave a door-only state open when the barrier is no longer a door.
    const active = panel.querySelector("[data-thr-state].active");
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
    for (const k of ["playersCanOperate", "lockable", "destructible"]) this.setField(panel, `interaction.${k}`, b.interaction[k]);
    for (const state of OVERRIDE_STATES) {
      for (const c of CHANNELS) this.setField(panel, `stateOverrides.${state}.${c}`, b.stateOverrides?.[state]?.[c] ?? "");
    }
  }

  fillMaterial(panel, materialId) {
    this.setField(panel, "material.durability", this.profiles.getMaterial(materialId)?.durability ?? null);
  }

  refresh(panel, form, notice, existing) {
    const ui = this.readPanel(panel);
    const active = Boolean(ui.profile);
    const sync = this.syncEnabled();
    panel.querySelector(".thr-body").classList.toggle("thr-disabled", !active);
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
    this.renderPreview(panel.querySelector(".thr-preview"), ui, existing);
  }

  renderPreview(target, ui, existing) {
    if (!ui.profile) {
      target.innerHTML = `<p class="hint">${esc(t("THRESHOLD.Config.PreviewNone"))}</p>`;
      return;
    }
    let barrier;
    try {
      barrier = barrierFromForm(foundry.utils.deepClone(ui), existing, this.profiles);
    } catch (err) {
      target.innerHTML = `<p class="thr-error">${esc(err.message)}</p>`;
      return;
    }
    const effective = PropertyEngine.effectiveChannels(barrier);
    const items = CHANNELS.map(c => {
      const values = CHANNEL_VALUES[c];
      const openness = values.indexOf(effective[c]) / (values.length - 1);
      const level = openness === 0 ? "blocked" : openness === 1 ? "open" : "partial";
      return `<li class="thr-chip thr-${level}"><span>${esc(t(`THRESHOLD.Channel.${c}`))}</span><strong>${esc(t(`THRESHOLD.Value.${effective[c]}`))}</strong></li>`;
    }).join("");
    const stateLabel = t(`THRESHOLD.State.${barrier.state}`);
    target.innerHTML = `<p class="thr-preview-title">${esc(game.i18n.format("THRESHOLD.Config.Preview", { state: stateLabel }))}</p><ul>${items}</ul>`;
  }
}

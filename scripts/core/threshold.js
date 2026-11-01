import { LOG_PREFIX, MODULE_ID, MODULE_VERSION, SYNC_OPTION } from "./constants.js";
import { WallConfigTab } from "../ui/wall-config-tab.js";
import { applyFormToChanges } from "../ui/wall-form.js";
import { DurabilityBars } from "../canvas/durability-bars.js";
import { BarrierManager } from "./barrier-manager.js";
import { GeometryEngine } from "../geometry/geometry-engine.js";
import { PropertyEngine } from "../properties/property-engine.js";
import { InteractionManager } from "../interactions/interaction-manager.js";
import { FoundryV14Adapter } from "../adapters/foundry-v14.js";
import { ProfileRegistry } from "../profiles/profile-registry.js";

class ThresholdFramework {
  constructor() {
    this.profiles = new ProfileRegistry();
    this.foundry = new FoundryV14Adapter();
    this.barriers = new BarrierManager({
      profiles: this.profiles,
      adapter: this.foundry,
      syncEnabled: () => this.syncEnabled()
    });
    this.geometry = GeometryEngine;
    this.properties = PropertyEngine;
    this.interactions = new InteractionManager();
    this.syncEnabled = () => game.settings.get(MODULE_ID, "syncNative");
    this.durabilityBars = new DurabilityBars({ mode: () => game.settings.get(MODULE_ID, "durabilityBars") });
    this.wallConfigTab = new WallConfigTab({ profiles: this.profiles, syncEnabled: this.syncEnabled });
  }

  registerSettings() {
    game.settings.register(MODULE_ID, "syncNative", {
      name: "THRESHOLD.Settings.SyncNative.Name",
      hint: "THRESHOLD.Settings.SyncNative.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    game.settings.register(MODULE_ID, "durabilityBars", {
      name: "THRESHOLD.Settings.DurabilityBars.Name",
      hint: "THRESHOLD.Settings.DurabilityBars.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: {
        none: "THRESHOLD.Settings.DurabilityBars.None",
        gm: "THRESHOLD.Settings.DurabilityBars.GM",
        all: "THRESHOLD.Settings.DurabilityBars.All"
      },
      default: "gm",
      onChange: () => this.durabilityBars.refresh()
    });
    game.settings.register(MODULE_ID, "debug", {
      name: "THRESHOLD.Settings.Debug.Name",
      hint: "THRESHOLD.Settings.Debug.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }

  registerHooks() {
    Hooks.on("canvasReady", () => this.durabilityBars.draw());
    Hooks.on("canvasTearDown", () => this.durabilityBars.teardown());
    for (const hook of ["createWall", "updateWall", "deleteWall"]) {
      Hooks.on(hook, () => this.durabilityBars.scheduleRefresh());
    }
    Hooks.on("sightRefresh", () => this.durabilityBars.updateVisibility());

    Hooks.on("renderWallConfig", (app, html) => {
      try {
        this.wallConfigTab.inject(app, html);
      } catch (err) {
        console.error(`${LOG_PREFIX} Could not add the Threshold tab to the wall sheet.`, err);
      }
    });

    // The wall sheet submits the tab's fields with its own update; rewrite that update
    // so the barrier and the native fields land together.
    Hooks.on("preUpdateWall", (wall, changes, options) => {
      if (options?.[SYNC_OPTION]) return;
      try {
        if (applyFormToChanges(wall, changes, { profiles: this.profiles, adapter: this.foundry, syncEnabled: this.syncEnabled })) {
          options[SYNC_OPTION] = true;
        }
      } catch (err) {
        ui.notifications?.error(game.i18n.format("THRESHOLD.Error.Invalid", { error: err.message }));
        return false;
      }
    });

    Hooks.on("updateWall", (wall, changes, options) => {
      if (options?.[SYNC_OPTION] || !("ds" in changes)) return;
      if (!game.users?.activeGM?.isSelf) return;
      this.barriers.handleNativeDoorChange(wall);
    });
  }

  async initialize() {
    await this.profiles.loadDefaults();
    // Let system adapters and worlds add or override profiles before the API is used.
    Hooks.callAll(`${MODULE_ID}.registerProfiles`, this.profiles);
    if (game.settings.get(MODULE_ID, "debug")) {
      console.info(`${LOG_PREFIX} Debug mode enabled. Profiles: ${this.profiles.list().join(", ")}`);
    }
  }

  publicAPI() {
    return Object.freeze({
      version: MODULE_VERSION,
      barriers: this.barriers,
      profiles: this.profiles,
      geometry: this.geometry,
      properties: this.properties,
      interactions: this.interactions,
      foundry: this.foundry,
      /** Shortcuts for macros: damage or repair the first selected wall. */
      damage: (amount, wall = this.foundry.getSelectedWalls()[0], options) => this.barriers.damage(wall, amount, options),
      repair: (amount, wall = this.foundry.getSelectedWalls()[0]) => this.barriers.repair(wall, amount),
      /** Shortcut: apply a profile to the selected walls. */
      apply: (profile, walls, overrides) => this.barriers.attachMany(profile, walls, overrides)
    });
  }
}

export const Threshold = new ThresholdFramework();

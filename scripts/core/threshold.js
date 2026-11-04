import { LOG_PREFIX, MODULE_ID, MODULE_VERSION, SYNC_OPTION } from "./constants.js";
import { WallConfigTab } from "../ui/wall-config-tab.js";
import { applyFormToChanges } from "../ui/wall-form.js";
import { DurabilityBars } from "../canvas/durability-bars.js";
import { BarrierTextures } from "../canvas/barrier-textures.js";
import { HelperWalls } from "./helper-walls.js";
import { CanvasAjar } from "../interactions/canvas-ajar.js";
import { runMigrations } from "./migrations.js";
import { getGuideApp, maybeShowWelcome, openGuide } from "../ui/guide.js";
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
    this.barrierTextures = new BarrierTextures();
    this.helperWalls = new HelperWalls({ adapter: this.foundry });
    this.canvasAjar = new CanvasAjar({ barriers: this.barriers });
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
    game.settings.registerMenu(MODULE_ID, "guide", {
      name: "THRESHOLD.Settings.Guide.Name",
      label: "THRESHOLD.Settings.Guide.Label",
      hint: "THRESHOLD.Settings.Guide.Hint",
      icon: "fa-solid fa-book-open",
      type: getGuideApp(),
      restricted: false
    });
    game.settings.register(MODULE_ID, "showWelcome", {
      name: "THRESHOLD.Settings.ShowWelcome.Name",
      hint: "THRESHOLD.Settings.ShowWelcome.Hint",
      scope: "user",
      config: true,
      type: Boolean,
      default: true
    });
    game.settings.register(MODULE_ID, "lastSeenVersion", {
      scope: "user",
      config: false,
      type: String,
      default: ""
    });
    game.settings.register(MODULE_ID, "migrationVersion", {
      scope: "world",
      config: false,
      type: Number,
      default: 0
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
    this.canvasAjar.activate();
    Hooks.on("canvasReady", () => {
      this.durabilityBars.draw();
      this.barrierTextures.refresh();
    });
    Hooks.on("canvasTearDown", () => {
      this.durabilityBars.teardown();
      this.barrierTextures.teardown();
    });
    for (const hook of ["createWall", "updateWall", "deleteWall"]) {
      Hooks.on(hook, () => {
        this.durabilityBars.scheduleRefresh();
        this.barrierTextures.scheduleRefresh();
      });
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

    Hooks.on("updateWall", async (wall, changes, options) => {
      if (!game.users?.activeGM?.isSelf) return;
      if (!options?.[SYNC_OPTION]) {
        // Hand edits first: a dragged door endpoint, or a native door control click.
        if ("c" in changes) await this.barriers.handleManualMove(wall);
        else if ("ds" in changes) await this.barriers.handleNativeDoorChange(wall);
      }
      await this.helperWalls.sync(wall);
    });
    Hooks.on("deleteWall", wall => {
      if (game.users?.activeGM?.isSelf) this.helperWalls.removeFor(wall.id, wall.parent);
    });
  }

  async initialize() {
    await this.profiles.loadDefaults();
    // Let system adapters and worlds add or override profiles before the API is used.
    Hooks.callAll(`${MODULE_ID}.registerProfiles`, this.profiles);
    await runMigrations(this.barriers);
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
      /** Open the welcome / guide window. */
      guide: () => openGuide(),
      /** Shortcuts for macros: stand the first selected door ajar (0–1). */
      ajar: (openFraction, wall = this.foundry.getSelectedWalls()[0]) => this.barriers.setAjar(wall, openFraction),
      /** Shortcuts for macros: damage or repair the first selected wall. */
      damage: (amount, wall = this.foundry.getSelectedWalls()[0], options) => this.barriers.damage(wall, amount, options),
      repair: (amount, wall = this.foundry.getSelectedWalls()[0]) => this.barriers.repair(wall, amount),
      /** Shortcut: apply a profile to the selected walls. */
      apply: (profile, walls, overrides) => this.barriers.attachMany(profile, walls, overrides)
    });
  }
}

export const Threshold = new ThresholdFramework();

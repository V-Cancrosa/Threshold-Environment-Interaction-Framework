import { LOG_PREFIX, MODULE_ID, MODULE_VERSION, SYNC_OPTION } from "./constants.js";
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
      syncEnabled: () => game.settings.get(MODULE_ID, "syncNative")
    });
    this.geometry = GeometryEngine;
    this.properties = PropertyEngine;
    this.interactions = new InteractionManager();
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
      /** Shortcut: apply a profile to the selected walls. */
      apply: (profile, walls, overrides) => this.barriers.attachMany(profile, walls, overrides)
    });
  }
}

export const Threshold = new ThresholdFramework();

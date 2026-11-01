import { MODULE_ID, MODULE_VERSION, LOG_PREFIX } from "./constants.js";
import { BarrierManager } from "./barrier-manager.js";
import { GeometryEngine } from "../geometry/geometry-engine.js";
import { PropertyEngine } from "../properties/property-engine.js";
import { InteractionManager } from "../interactions/interaction-manager.js";
import { FoundryV14Adapter } from "../adapters/foundry-v14.js";

class ThresholdFramework {
  constructor() {
    this.barriers = new BarrierManager();
    this.geometry = GeometryEngine;
    this.properties = PropertyEngine;
    this.interactions = new InteractionManager();
    this.foundry = new FoundryV14Adapter();
  }

  registerSettings() {
    game.settings.register(MODULE_ID, "debug", {
      name: "THRESHOLD.Settings.Debug.Name",
      hint: "THRESHOLD.Settings.Debug.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }

  initialize() {
    if (game.settings.get(MODULE_ID, "debug")) {
      console.info(`${LOG_PREFIX} Debug mode enabled.`);
    }
  }

  publicAPI() {
    return Object.freeze({
      version: MODULE_VERSION,
      barriers: this.barriers,
      geometry: this.geometry,
      properties: this.properties,
      interactions: this.interactions,
      foundry: this.foundry
    });
  }
}

export const Threshold = new ThresholdFramework();

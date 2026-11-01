import { MODULE_ID, LOG_PREFIX } from "./core/constants.js";
import { Threshold } from "./core/threshold.js";

Hooks.once("init", () => {
  Threshold.registerSettings();
  console.info(`${LOG_PREFIX} Initializing Threshold — Environment Interaction Framework.`);
});

Hooks.once("ready", () => {
  Threshold.initialize();
  game.modules.get(MODULE_ID).api = Threshold.publicAPI();
  console.info(`${LOG_PREFIX} Ready. Public API available at game.modules.get('${MODULE_ID}').api`);
});

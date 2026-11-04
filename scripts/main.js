import { MODULE_ID, LOG_PREFIX } from "./core/constants.js";
import { Threshold } from "./core/threshold.js";
import { maybeShowWelcome } from "./ui/guide.js";

Hooks.once("init", () => {
  Threshold.registerSettings();
  Threshold.registerHooks();
  console.info(`${LOG_PREFIX} Initializing Threshold — Environment Interaction Framework.`);
});

Hooks.once("ready", async () => {
  try {
    await Threshold.initialize();
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to load barrier profiles.`, err);
  }
  game.modules.get(MODULE_ID).api = Threshold.publicAPI();
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  maybeShowWelcome();
  console.info(`${LOG_PREFIX} Ready. Public API available at game.modules.get('${MODULE_ID}').api`);
});

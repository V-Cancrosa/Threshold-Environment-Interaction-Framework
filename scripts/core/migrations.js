import { FLAG_KEY, LOG_PREFIX, MODULE_ID } from "./constants.js";

/** Bundled profiles, whose stored thickness came from a preset value. */
const BUNDLED = new Set(["window", "curtained-window", "armored-glass", "bars", "viewing-slot", "force-field", "barricade"]);
/** 0.7.x preset thicknesses → 0.9 (a third, rounded). */
const THICKNESS_0_9 = new Map([[0.15, 0.05], [0.2, 0.07], [0.25, 0.08], [0.35, 0.12]]);

/**
 * New thickness for a barrier still using a 0.7.x preset value, or null to leave it.
 * Values a GM typed in themselves (anything not on the old preset list) are kept.
 */
export function migratedThickness(barrier) {
  const thickness = barrier?.appearance?.thickness;
  if (!THICKNESS_0_9.has(thickness)) return null;
  if (!BUNDLED.has(barrier.profile) && thickness !== 0.2) return null;
  return THICKNESS_0_9.get(thickness);
}

/** One-time data migrations, run by the active GM when the world loads. */
export async function runMigrations(barriers) {
  if (!game.users?.activeGM?.isSelf) return;
  const done = game.settings.get(MODULE_ID, "migrationVersion") ?? 0;
  if (done >= 1) return;
  let count = 0;
  for (const scene of game.scenes ?? []) {
    for (const wall of scene.walls ?? []) {
      const thickness = migratedThickness(wall.getFlag(MODULE_ID, FLAG_KEY));
      if (thickness === null) continue;
      try {
        await barriers.update(wall, { appearance: { thickness } });
        count++;
      } catch (err) {
        console.warn(`${LOG_PREFIX} Could not migrate wall ${wall.id} in ${scene.name}.`, err);
      }
    }
  }
  await game.settings.set(MODULE_ID, "migrationVersion", 1);
  if (count) console.info(`${LOG_PREFIX} Made ${count} barrier texture(s) thinner (0.9 migration).`);
}

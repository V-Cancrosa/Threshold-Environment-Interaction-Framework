import { FLAG_KEY, LOG_PREFIX, MODULE_ID } from "../core/constants.js";
import { PropertyEngine } from "../properties/property-engine.js";

/** Draw order inside the primary group: above tiles and drawings, below tokens. */
const SORT_LAYER = 650;

/**
 * Split a wall into roughly grid-sized pieces so a texture repeats along the wall
 * instead of stretching. Each piece is centred on its own stretch of the wall.
 */
export function textureSegments(c, gridSize, thickness, repeat = true) {
  const [x0, y0, x1, y1] = c;
  const length = Math.hypot(x1 - x0, y1 - y0);
  if (!length) return [];
  const count = repeat ? Math.max(1, Math.round(length / gridSize)) : 1;
  const rotation = Math.atan2(y1 - y0, x1 - x0);
  const width = length / count;
  const height = Math.max(2, gridSize * thickness);
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, rotation, width, height };
  });
}

/** Which walls Threshold draws itself: textured barriers that are not doors. */
export function drawnTexture(barrier) {
  if (!barrier || (barrier.interaction?.door ?? "none") !== "none") return null;
  return PropertyEngine.textureFor(barrier) || null;
}

/**
 * Textures for barriers Foundry does not draw (bars, windows, force fields…). Meshes
 * live in the primary canvas group like tiles, so fog of war and vision hide them the
 * same way. Doors are left to Foundry's own animated door mesh.
 */
export class BarrierTextures {
  constructor() {
    this.meshes = [];
    this._timer = null;
    this._generation = 0;
  }

  scheduleRefresh() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.refresh(), 30);
  }

  clear() {
    for (const mesh of this.meshes) {
      if (!mesh.destroyed) mesh.destroy();
    }
    this.meshes = [];
  }

  async refresh() {
    const generation = ++this._generation;
    if (!globalThis.canvas?.primary || !canvas.scene) return this.clear();
    const Mesh = foundry.canvas?.primary?.PrimarySpriteMesh ?? globalThis.PrimarySpriteMesh;
    const load = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    if (!Mesh || !load) return;

    const gridSize = canvas.grid?.size ?? canvas.scene.grid?.size ?? 100;
    const wanted = [];
    for (const wall of canvas.scene.walls) {
      const barrier = wall.getFlag(MODULE_ID, FLAG_KEY);
      const src = drawnTexture(barrier);
      if (src) wanted.push({ wall, src, thickness: barrier.appearance?.thickness ?? 0.07, repeat: barrier.appearance?.repeat !== false });
    }

    // Load everything first so a slow texture never leaves the map half-drawn.
    const textures = new Map();
    await Promise.all([...new Set(wanted.map(w => w.src))].map(async src => {
      try {
        textures.set(src, await load(src));
      } catch (err) {
        console.warn(`${LOG_PREFIX} Could not load barrier texture ${src}.`, err);
      }
    }));
    if (generation !== this._generation) return; // a newer refresh has started

    this.clear();
    for (const { wall, src, thickness, repeat } of wanted) {
      const texture = textures.get(src);
      if (!texture) continue;
      for (const seg of textureSegments(wall.c, gridSize, thickness, repeat)) {
        const mesh = new Mesh({ texture, name: `${MODULE_ID}.${wall.id}` });
        mesh.anchor?.set(0.5, 0.5);
        mesh.position.set(seg.x, seg.y);
        mesh.rotation = seg.rotation;
        mesh.width = seg.width;
        mesh.height = seg.height;
        if ("sortLayer" in mesh) mesh.sortLayer = SORT_LAYER;
        canvas.primary.addChild(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  teardown() {
    clearTimeout(this._timer);
    this._generation++;
    this.clear();
  }
}

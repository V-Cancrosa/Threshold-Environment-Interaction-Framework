import { FLAG_KEY, MODULE_ID } from "../core/constants.js";
import { PropertyEngine } from "../properties/property-engine.js";

/** Bar colour as a number, matching the sheet's ramp (green → red). */
export function integrityColorNumber(ratio) {
  const r = Math.round(255 * Math.min(1, 2 * (1 - ratio)));
  const g = Math.round(200 * Math.min(1, 2 * ratio));
  return (r << 16) + (g << 8) + 40;
}

/**
 * Where to draw a wall's bar, clear of the door icon at the midpoint: below mostly
 * horizontal walls, beside mostly vertical ones.
 */
export function barGeometry(c, gridSize) {
  const [x0, y0, x1, y1] = c;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const width = Math.round(gridSize * 0.8);
  const height = Math.max(4, Math.round(gridSize * 0.12));
  const vertical = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (vertical) {
    return { x: Math.round(mx + gridSize * 0.28), y: Math.round(my - height / 2), width, height };
  }
  return { x: Math.round(mx - width / 2), y: Math.round(my + gridSize * 0.32), width, height };
}

/** Which barriers get a bar at all: destructible ones with a maximum durability. */
export function barFor(barrier) {
  if (!barrier?.enabled || !barrier.interaction?.destructible) return null;
  return PropertyEngine.integrity(barrier);
}

/**
 * Durability bars over destructible barriers, drawn in the controls layer so they show
 * on every canvas layer, like door icons. The GM sees all of them; players (if the
 * setting allows) see only bars at points they can currently see.
 */
export class DurabilityBars {
  /** @param {{mode: () => "none"|"gm"|"all"}} options */
  constructor({ mode }) {
    this.mode = mode;
    this.container = null;
    this.bars = new Map();
    this._timer = null;
  }

  draw() {
    this.teardown();
    if (!globalThis.canvas?.controls || !globalThis.PIXI) return;
    this.container = new PIXI.Container();
    this.container.name = `${MODULE_ID}-durability-bars`;
    this.container.eventMode = "none";
    canvas.controls.addChild(this.container);
    this.refresh();
  }

  /** Rebuild on the next tick; wall updates often come in bursts. */
  scheduleRefresh() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.refresh(), 30);
  }

  refresh() {
    if (!this.container || this.container.destroyed) return;
    for (const bar of this.bars.values()) bar.destroy();
    this.bars.clear();
    const mode = this.mode();
    if (mode === "none" || (mode === "gm" && !game.user.isGM)) return;
    const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;
    for (const wall of canvas.scene?.walls ?? []) {
      const integrity = barFor(wall.getFlag(MODULE_ID, FLAG_KEY));
      if (!integrity) continue;
      const bar = this.drawBar(barGeometry(wall.c, gridSize), integrity);
      bar.thresholdWall = wall;
      this.container.addChild(bar);
      this.bars.set(wall.id, bar);
    }
    this.updateVisibility();
  }

  drawBar({ x, y, width, height }, { ratio }) {
    const g = new PIXI.Graphics();
    const radius = height / 2;
    g.beginFill(0x000000, 0.6).lineStyle(1, 0x000000, 0.9).drawRoundedRect(0, 0, width, height, radius).endFill();
    if (ratio > 0) {
      g.lineStyle(0).beginFill(integrityColorNumber(ratio), 0.9)
        .drawRoundedRect(1, 1, Math.max(0, (width - 2) * ratio), height - 2, radius - 1).endFill();
    }
    g.position.set(x, y);
    return g;
  }

  /** Players only see bars on walls they can currently see. */
  updateVisibility() {
    if (game.user.isGM) {
      for (const bar of this.bars.values()) bar.visible = true;
      return;
    }
    for (const bar of this.bars.values()) {
      const wall = bar.thresholdWall;
      const door = wall.object?.doorControl;
      if (door) {
        bar.visible = Boolean(door.visible);
        continue;
      }
      const [x0, y0, x1, y1] = wall.c;
      try {
        bar.visible = canvas.visibility?.testVisibility?.({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { tolerance: 4 }) ?? false;
      } catch {
        bar.visible = false;
      }
    }
  }

  teardown() {
    clearTimeout(this._timer);
    for (const bar of this.bars.values()) bar.destroy();
    this.bars.clear();
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    this.container = null;
  }
}

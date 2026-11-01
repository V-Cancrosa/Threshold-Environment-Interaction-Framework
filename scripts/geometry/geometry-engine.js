/**
 * Geometry for Threshold: where a door leaf is when it stands ajar, and how wide the
 * resulting gap is. Pure functions; the Foundry adapter applies the results.
 */
export class GeometryEngine {
  static clampOpenFraction(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new TypeError("openFraction must be numeric.");
    return Math.min(1, Math.max(0, n));
  }

  static rotatePoint(point, origin, radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos
    };
  }

  /** Return the rotated endpoint for a simple hinged door segment. */
  static hingedEndpoint(hinge, endpoint, angleDegrees) {
    return this.rotatePoint(endpoint, hinge, angleDegrees * Math.PI / 180);
  }

  /** Does this barrier physically move when ajar? */
  static isPhysical(barrier) {
    return barrier?.geometry?.mode === "physical" && (barrier.interaction?.door ?? "none") !== "none";
  }

  /** How the leaf moves: sliding doors retract along the wall, everything else swings. */
  static motion(barrier) {
    return barrier?.appearance?.animation === "slide" ? "slide" : "swing";
  }

  /** Swing angle in degrees for an open fraction (1 = 90°). */
  static swingAngle(openFraction) {
    return this.clampOpenFraction(openFraction) * 90;
  }

  /**
   * Leaf coordinates for a door standing ajar.
   * @param {number[]} closedC  [x0, y0, x1, y1] of the closed door
   * @param {object} options
   * @param {"a"|"b"} options.hinge     Which end is the hinge (a = x0,y0)
   * @param {1|-1} options.swing        Rotation direction (1 = clockwise on screen)
   * @param {"swing"|"slide"} options.motion
   * @param {number} options.openFraction
   * @returns {number[]} new [x0, y0, x1, y1], hinge end unchanged, rounded to whole pixels
   */
  static leafCoords(closedC, { hinge = "a", swing = 1, motion = "swing", openFraction = 0 } = {}) {
    const [x0, y0, x1, y1] = closedC;
    const h = hinge === "b" ? { x: x1, y: y1 } : { x: x0, y: y0 };
    const f = hinge === "b" ? { x: x0, y: y0 } : { x: x1, y: y1 };
    const amount = this.clampOpenFraction(openFraction);
    let moved;
    if (motion === "slide") {
      // Retract towards the hinge, leaving a sliver so the wall never has zero length.
      const keep = Math.max(1 - amount, 0.02);
      moved = { x: h.x + (f.x - h.x) * keep, y: h.y + (f.y - h.y) * keep };
    } else {
      moved = this.rotatePoint(f, h, (swing === -1 ? -1 : 1) * this.swingAngle(amount) * Math.PI / 180);
    }
    const free = { x: Math.round(moved.x), y: Math.round(moved.y) };
    return hinge === "b" ? [free.x, free.y, x1, y1] : [x0, y0, free.x, free.y];
  }

  /** Width of the opening, in the same units as the coordinates. */
  static gapWidth(closedC, { motion = "swing", openFraction = 0 } = {}) {
    const [x0, y0, x1, y1] = closedC;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const amount = this.clampOpenFraction(openFraction);
    if (motion === "slide") return length * amount;
    return 2 * length * Math.sin((this.swingAngle(amount) * Math.PI / 180) / 2);
  }

  /**
   * Settle a barrier's geometry against the wall's current coordinates.
   * Returns the barrier to store (with closedC filled in or cleared) and the wall
   * coordinates to write, or c: undefined to leave them alone.
   */
  static resolve(barrier, wallC) {
    const g = barrier.geometry ?? {};
    if (this.isPhysical(barrier) && barrier.enabled !== false) {
      const closedC = g.closedC ?? [...wallC];
      const next = { ...barrier, geometry: { ...g, closedC } };
      const c = barrier.state === "ajar"
        ? this.leafCoords(closedC, { hinge: g.hinge, swing: g.swing, motion: this.motion(barrier), openFraction: g.openFraction })
        : [...closedC];
      return { barrier: next, c };
    }
    if (g.closedC) {
      // Leaving physical mode: put the door back where it was closed.
      return { barrier: { ...barrier, geometry: { ...g, closedC: null } }, c: [...g.closedC] };
    }
    return { barrier, c: undefined };
  }

  /**
   * The movement-only wall that should sit in the door frame, or null. Needed while
   * a physical door stands ajar with a gap narrower than passableGap.
   */
  static helperFor(barrier, gridSize) {
    if (!this.isPhysical(barrier) || barrier.enabled === false || barrier.state !== "ajar") return null;
    const g = barrier.geometry;
    if (!g.closedC || barrier.channels?.movement !== "blocked") return null;
    const gap = this.gapWidth(g.closedC, { motion: this.motion(barrier), openFraction: g.openFraction });
    if (gap >= (g.passableGap ?? 1) * gridSize) return null;
    return { c: [...g.closedC] };
  }
}

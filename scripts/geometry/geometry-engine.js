/**
 * Geometry utilities for Threshold. MVP 0.1 deliberately stores advanced geometry
 * without replacing Foundry's native wall collision/perception algorithms.
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
}

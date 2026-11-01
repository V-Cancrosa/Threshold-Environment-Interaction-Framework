/** Narrow compatibility boundary for Foundry VTT V14. */
export class FoundryV14Adapter {
  getSelectedWalls() {
    const controlled = canvas?.walls?.controlled ?? [];
    return controlled.map(placeable => placeable.document).filter(Boolean);
  }

  getWallById(id) {
    return canvas?.scene?.walls?.get(id) ?? null;
  }

  async updateNativeWall(wall, changes) {
    if (!wall?.update) throw new TypeError("Expected a WallDocument.");
    return wall.update(changes);
  }
}

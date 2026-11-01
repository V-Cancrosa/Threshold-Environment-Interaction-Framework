import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockScene, MockWall, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { ProfileRegistry } = await import("../scripts/profiles/profile-registry.js");
const { FoundryV14Adapter } = await import("../scripts/adapters/foundry-v14.js");
const { BarrierManager } = await import("../scripts/core/barrier-manager.js");
const { HelperWalls } = await import("../scripts/core/helper-walls.js");
const { GeometryEngine } = await import("../scripts/geometry/geometry-engine.js");
const { applyFormToChanges } = await import("../scripts/ui/wall-form.js");

let profiles, adapter, manager, helpers;
beforeEach(() => {
  installFoundryMock();
  profiles = new ProfileRegistry();
  profiles.registerMany(readJSON("../profiles/barriers.json"), readJSON("../profiles/materials.json"));
  adapter = new FoundryV14Adapter();
  manager = new BarrierManager({ profiles, adapter });
  helpers = new HelperWalls({ adapter });
});

test("a swinging leaf rotates around its hinge", () => {
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { openFraction: 1 }), [0, 0, 0, 100], "90° clockwise");
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { openFraction: 1, swing: -1 }), [0, 0, 0, -100]);
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { openFraction: 1, hinge: "b" }), [100, -100, 100, 0], "hinge at the far end");
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { openFraction: 0 }), [0, 0, 100, 0]);
});

test("a sliding leaf retracts towards its hinge", () => {
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { motion: "slide", openFraction: 0.4 }), [0, 0, 60, 0]);
  assert.deepEqual(GeometryEngine.leafCoords([0, 0, 100, 0], { motion: "slide", openFraction: 1 }), [0, 0, 2, 0], "never zero length");
});

test("gap width", () => {
  assert.equal(Math.round(GeometryEngine.gapWidth([0, 0, 100, 0], { openFraction: 2 / 3 })), 100, "60° on a 1-square door = 1 square");
  assert.equal(GeometryEngine.gapWidth([0, 0, 100, 0], { motion: "slide", openFraction: 0.25 }), 25);
});

test("standing a physical door ajar moves the leaf and keeps senses blocked", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  assert.deepEqual(wall.getFlag("threshold", "barrier").geometry.closedC, [0, 0, 100, 0]);
  await manager.setAjar(wall, 1 / 3);
  assert.deepEqual(wall._source.c, [0, 0, 87, 50], "30° swing");
  assert.equal(wall._source.sight, 20, "the leaf itself blocks; the gap is geometry");
  assert.equal(wall._source.ds, 0);
  assert.equal(wall._source.door, 1);
});

test("opening and closing an ajar door puts the leaf back", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 0.5);
  wall._source.ds = 1;
  await manager.handleNativeDoorChange(wall);
  assert.deepEqual(wall._source.c, [0, 0, 100, 0]);
  assert.equal(wall.getFlag("threshold", "barrier").state, "open");
});

test("dragging a physical door's endpoint adopts the new closed position", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 0.5);
  wall._source.c = [0, 0, 200, 0];
  await manager.handleManualMove(wall);
  const barrier = wall.getFlag("threshold", "barrier");
  assert.deepEqual(barrier.geometry.closedC, [0, 0, 200, 0]);
  assert.equal(barrier.state, "closed");
  assert.deepEqual(wall._source.c, [0, 0, 200, 0]);
});

test("removing the barrier returns an ajar leaf to its closed position", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 0.5);
  await manager.remove(wall);
  assert.deepEqual(wall._source.c, [0, 0, 100, 0]);
});

test("switching to approximate mode puts the leaf back and forgets closedC", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 0.5);
  const barrier = await manager.update(wall, { geometry: { mode: "native-segment" } });
  assert.deepEqual(wall._source.c, [0, 0, 100, 0]);
  assert.equal(barrier.geometry.closedC, null);
  assert.equal(wall._source.sight, 10, "approximation: limited sight while ajar");
});

test("a narrow gap gets a movement-only helper wall; a wide one does not", async () => {
  const scene = new MockScene();
  const wall = scene.add(new MockWall());
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 1 / 3);
  await helpers.sync(wall);
  let found = helpers.find(scene, wall.id);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].c, [0, 0, 100, 0]);
  assert.deepEqual([found[0]._source.move, found[0]._source.sight, found[0]._source.light, found[0]._source.sound], [20, 0, 0, 0]);
  await helpers.sync(wall);
  assert.equal(helpers.find(scene, wall.id).length, 1, "sync is idempotent");

  await manager.setAjar(wall, 0.8);
  await helpers.sync(wall);
  assert.equal(helpers.find(scene, wall.id).length, 0, "72° leaves a gap over one square");

  await manager.setAjar(wall, 0.2);
  await helpers.sync(wall);
  await manager.setState(wall, "closed");
  await helpers.sync(wall);
  assert.equal(helpers.find(scene, wall.id).length, 0, "closed door needs no helper");
});

test("helpers follow the door when it is removed or deleted", async () => {
  const scene = new MockScene();
  const wall = scene.add(new MockWall());
  await manager.attach(wall, "door");
  await manager.setAjar(wall, 0.2);
  await helpers.sync(wall);
  await helpers.removeFor(wall.id, scene);
  assert.equal(helpers.find(scene, wall.id).length, 0);
});

test("the wall sheet can switch physical mode and set hinge, swing and opening", async () => {
  const wall = new MockWall();
  const changes = { flags: { threshold: { ui: { profile: "door", state: "ajar",
    geometry: { physical: true, hinge: "b", swing: "-1", openPercent: "100", passableGap: "0.5" } } } } };
  applyFormToChanges(wall, changes, { profiles, adapter });
  const g = changes.flags.threshold.barrier.geometry;
  assert.deepEqual([g.mode, g.hinge, g.swing, g.openFraction, g.passableGap], ["physical", "b", -1, 1, 0.5]);
  assert.deepEqual(changes.c, [100, 100, 100, 0], "hinge b, swung 90° the other way");
});

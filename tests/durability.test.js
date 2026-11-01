import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockWall, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { ProfileRegistry } = await import("../scripts/profiles/profile-registry.js");
const { FoundryV14Adapter } = await import("../scripts/adapters/foundry-v14.js");
const { makeBarrier } = await import("../scripts/core/defaults.js");
const { barFor, barGeometry, integrityColorNumber } = await import("../scripts/canvas/durability-bars.js");
const { applyFormToChanges } = await import("../scripts/ui/wall-form.js");

let profiles, deps;
beforeEach(() => {
  installFoundryMock();
  profiles = new ProfileRegistry();
  profiles.registerMany(readJSON("../profiles/barriers.json"), readJSON("../profiles/materials.json"));
  deps = { profiles, adapter: new FoundryV14Adapter() };
});

test("only destructible barriers with durability get a bar", () => {
  assert.deepEqual(barFor(makeBarrier(profiles.resolve("door"))), { current: 30, max: 30, ratio: 1 });
  assert.equal(barFor(makeBarrier(profiles.resolve("solid-wall"))), null, "not destructible");
  assert.equal(barFor(makeBarrier(profiles.resolve("force-field"))), null, "no durability");
  assert.equal(barFor(null), null);
});

test("bar sits under horizontal walls and beside vertical ones", () => {
  assert.deepEqual(barGeometry([0, 0, 200, 0], 100), { x: 60, y: 32, width: 80, height: 12 });
  assert.deepEqual(barGeometry([0, 0, 0, 200], 100), { x: 28, y: 94, width: 80, height: 12 });
});

test("bar colour runs from green to red", () => {
  assert.equal(integrityColorNumber(1) >> 16, 0, "no red when whole");
  assert.equal((integrityColorNumber(0) >> 8) & 0xff, 0, "no green when broken");
});

const sheet = ui => ({ flags: { threshold: { ui: { profile: "door", ...ui } } } });

test("current durability typed on the tab is stored", async () => {
  const wall = new MockWall();
  const changes = sheet({ integrity: { current: "12" } });
  applyFormToChanges(wall, changes, deps);
  await wall.update(changes);
  assert.equal(wall.getFlag("threshold", "barrier").integrity.current, 12);
});

test("empty or full current durability is stored as null (full)", () => {
  for (const current of ["", "30", "45"]) {
    const changes = sheet({ integrity: { current } });
    applyFormToChanges(new MockWall(), changes, deps);
    assert.equal(changes.flags.threshold.barrier.integrity.current, null, `current=${current}`);
  }
});

test("lowering max durability below current clamps to full", () => {
  const changes = sheet({ integrity: { current: "25" }, material: { durability: "20" } });
  applyFormToChanges(new MockWall(), changes, deps);
  assert.equal(changes.flags.threshold.barrier.integrity.current, null);
  assert.equal(changes.flags.threshold.barrier.material.durability, 20);
});

const { textureSegments, drawnTexture } = await import("../scripts/canvas/barrier-textures.js");

test("textures repeat once per grid square along the wall", () => {
  const segs = textureSegments([0, 0, 300, 0], 100, 0.2);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map(s => s.x), [50, 150, 250]);
  assert.equal(segs[0].width, 100);
  assert.equal(segs[0].height, 20);
  const diagonal = textureSegments([0, 0, 0, 250], 100, 0.2);
  assert.equal(diagonal.length, 3, "2.5 squares round to 3 pieces");
  assert.ok(Math.abs(diagonal[0].rotation - Math.PI / 2) < 1e-9);
  const single = textureSegments([0, 0, 300, 0], 100, 0.2, false);
  assert.deepEqual([single.length, single[0].x, single[0].width], [1, 150, 300], "repeat off: one stretched copy");
});

test("Threshold draws textures only for non-door barriers", () => {
  assert.equal(drawnTexture(makeBarrier(profiles.resolve("bars"))), "modules/threshold/assets/textures/bars.svg");
  assert.equal(drawnTexture(makeBarrier(profiles.resolve("door"))), null, "doors use Foundry's door mesh");
  assert.equal(drawnTexture(makeBarrier(profiles.resolve("force-field"), { state: "damaged" })), null, "field down: nothing drawn");
  assert.equal(drawnTexture(makeBarrier(profiles.resolve("window"), { state: "damaged" })), "modules/threshold/assets/textures/window-broken.svg");
});

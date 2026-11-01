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

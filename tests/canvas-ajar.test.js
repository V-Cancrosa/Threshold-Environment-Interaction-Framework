import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockWall, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { ProfileRegistry } = await import("../scripts/profiles/profile-registry.js");
const { FoundryV14Adapter } = await import("../scripts/adapters/foundry-v14.js");
const { BarrierManager } = await import("../scripts/core/barrier-manager.js");
const { makeBarrier } = await import("../scripts/core/defaults.js");
const { CanvasAjar, ajarRefusal, stepAjar } = await import("../scripts/interactions/canvas-ajar.js");
const { migratedThickness } = await import("../scripts/core/migrations.js");

let profiles, manager, ajar;
beforeEach(() => {
  installFoundryMock();
  profiles = new ProfileRegistry();
  profiles.registerMany(readJSON("../profiles/barriers.json"), readJSON("../profiles/materials.json"));
  manager = new BarrierManager({ profiles, adapter: new FoundryV14Adapter() });
  ajar = new CanvasAjar({ barriers: manager });
});

const door = extra => makeBarrier(profiles.resolve("door"), extra);
const GM = { isGM: true };
const PLAYER = { isGM: false };

test("wheel notches open a closed door step by step and close it at zero", () => {
  assert.deepEqual(stepAjar(door(), 2), { state: "ajar", openFraction: 0.1 });
  assert.deepEqual(stepAjar(door({ state: "ajar", geometry: { openFraction: 0.1 } }), -2), { state: "closed" });
  assert.deepEqual(stepAjar(door({ state: "ajar", geometry: { openFraction: 0.95 } }), 5), { state: "ajar", openFraction: 1 });
  assert.deepEqual(stepAjar(door({ state: "open" }), -1), { state: "ajar", openFraction: 0.95 }, "an open door can be pushed to");
  assert.deepEqual(stepAjar(door(), -3), { state: "closed" });
});

test("who may stand a door ajar", () => {
  assert.equal(ajarRefusal(PLAYER, door()), null, "door profile lets players operate it");
  assert.equal(ajarRefusal(PLAYER, door({ interaction: { playersCanOperate: false } })), "NotAllowed");
  assert.equal(ajarRefusal(GM, door({ interaction: { playersCanOperate: false } })), null);
  assert.equal(ajarRefusal(GM, door({ state: "locked" })), "Locked");
  assert.equal(ajarRefusal(PLAYER, makeBarrier(profiles.resolve("secret-door"))), "NotAllowed");
  assert.equal(ajarRefusal(GM, makeBarrier(profiles.resolve("bars"))), "NotDoor");
  assert.equal(ajarRefusal(GM, null), "NoBarrier");
});

test("apply moves the leaf, and refuses a locked door", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  assert.equal(await ajar.apply(wall, 6, PLAYER), null);
  const barrier = wall.getFlag("threshold", "barrier");
  assert.deepEqual([barrier.state, barrier.geometry.openFraction], ["ajar", 0.3]);
  assert.notDeepEqual(wall._source.c, [0, 0, 100, 0]);
  await manager.setState(wall, "locked");
  assert.equal(await ajar.apply(wall, 2, PLAYER), "Locked");
});

test("socket requests are applied by the GM with the sender's permissions", async () => {
  const wall = new MockWall();
  wall.id = "door1";
  await manager.attach(wall, "door", { interaction: { playersCanOperate: false } });
  const users = { gm: { id: "gm", isGM: true, name: "GM" }, p: { id: "p", isGM: false, name: "Player" } };
  globalThis.game.users = { activeGM: { isSelf: true }, get: id => users[id] };
  globalThis.game.scenes = { get: () => ({ walls: { get: id => (id === "door1" ? wall : undefined) } }) };
  const request = { action: "ajar", sceneId: "s", wallId: "door1", steps: 4 };

  await ajar._onSocket({ ...request, userId: "p" }, "p");
  assert.equal(wall.getFlag("threshold", "barrier").state, "closed", "player without permission is refused");

  await ajar._onSocket({ ...request, userId: "gm" });
  assert.equal(wall.getFlag("threshold", "barrier").state, "closed", "a GM id in the payload alone is not trusted");

  await ajar._onSocket({ ...request, userId: "gm" }, "gm");
  assert.equal(wall.getFlag("threshold", "barrier").state, "ajar");
});

test("0.9 migration thins preset thicknesses and keeps custom ones", () => {
  const b = (profile, thickness) => ({ profile, appearance: { thickness } });
  assert.equal(migratedThickness(b("barricade", 0.35)), 0.12);
  assert.equal(migratedThickness(b("bars", 0.15)), 0.05, "0.7.0 bars");
  assert.equal(migratedThickness(b("bars", 0.2)), 0.07, "0.7.1 bars");
  assert.equal(migratedThickness(b("window", 0.4)), null, "typed by the GM");
  assert.equal(migratedThickness(b("my-profile", 0.25)), null, "custom profile");
  assert.equal(migratedThickness(b("my-profile", 0.2)), 0.07, "old default");
  assert.equal(migratedThickness(b("window", 0.05)), null, "already migrated");
});

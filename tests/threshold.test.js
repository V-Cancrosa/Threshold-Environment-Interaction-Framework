import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockWall, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { ProfileRegistry } = await import("../scripts/profiles/profile-registry.js");
const { FoundryV14Adapter } = await import("../scripts/adapters/foundry-v14.js");
const { BarrierManager } = await import("../scripts/core/barrier-manager.js");
const { makeBarrier } = await import("../scripts/core/defaults.js");
const { validateBarrier } = await import("../scripts/core/validator.js");
const { PropertyEngine } = await import("../scripts/properties/property-engine.js");

const SENSE = { NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30 };

let profiles, adapter, manager;
beforeEach(() => {
  installFoundryMock();
  profiles = new ProfileRegistry();
  profiles.registerMany(readJSON("../profiles/barriers.json"), readJSON("../profiles/materials.json"));
  adapter = new FoundryV14Adapter();
  manager = new BarrierManager({ profiles, adapter });
});

const nativeFor = (id, overrides = {}) => adapter.toWallData(makeBarrier(profiles.resolve(id), overrides), 5);

test("every bundled profile resolves to a valid barrier", () => {
  for (const id of profiles.list()) {
    const errors = validateBarrier(makeBarrier(profiles.resolve(id)));
    assert.deepEqual(errors, [], `profile ${id}`);
  }
});

test("profiles inherit material durability", () => {
  assert.equal(profiles.resolve("reinforced-door").material.durability, 120);
});

test("closed gate blocks movement but lets sight, light and sound through", () => {
  assert.deepEqual(nativeFor("gate"), {
    move: 20, door: 1, ds: 0, sight: SENSE.NONE, light: SENSE.NONE, sound: SENSE.NONE,
    threshold: { attenuation: false, sight: null, light: null, sound: null }
  });
});

test("a gate left ajar stays see-through", () => {
  const data = nativeFor("gate", { state: "ajar" });
  assert.equal(data.sight, SENSE.NONE);
  assert.equal(data.move, 20);
});

test("a wooden door left ajar gives limited sight and passes sound", () => {
  const data = nativeFor("door", { state: "ajar" });
  assert.equal(data.ds, 0);
  assert.equal(data.sight, SENSE.LIMITED);
  assert.equal(data.sound, SENSE.NONE);
});

test("open and locked doors map to native door states", () => {
  assert.equal(nativeFor("door", { state: "open" }).ds, 1);
  assert.equal(nativeFor("door", { state: "locked" }).ds, 2);
  assert.equal(nativeFor("door", { state: "locked" }).sight, SENSE.NORMAL);
});

test("frosted glass blocks sight but transmits light", () => {
  const data = nativeFor("frosted-glass-door");
  assert.equal(data.sight, SENSE.NORMAL);
  assert.equal(data.light, SENSE.NONE);
});

test("window proximity threshold is converted from grid units to scene distance", () => {
  const data = nativeFor("window");
  assert.equal(data.sight, SENSE.PROXIMITY);
  assert.equal(data.threshold.sight, 5);
  assert.equal(data.threshold.light, null);
});

test("curtained window uses its own 'open' override instead of becoming passable", () => {
  const data = nativeFor("curtained-window", { state: "open" });
  assert.equal(data.move, 20);
  assert.equal(data.sight, SENSE.PROXIMITY);
  assert.equal(data.door, 0);
});

test("damaged barricade becomes passable but keeps vision", () => {
  const channels = PropertyEngine.effectiveChannels(makeBarrier(profiles.resolve("barricade"), { state: "damaged" }));
  assert.equal(channels.movement, "passable");
  assert.equal(channels.cover, "none");
});

test("ajar and locked are rejected for barriers that are not doors", () => {
  const errors = validateBarrier(makeBarrier(profiles.resolve("bars"), { state: "locked" }));
  assert.ok(errors.some(e => e.includes("requires interaction.door")));
});

test("invalid channel values are rejected", () => {
  const errors = validateBarrier(makeBarrier({ channels: { vision: "see-through" } }));
  assert.ok(errors.some(e => e.includes("channels.vision")));
});

test("attach writes flag, native fields and backup in a single update", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "gate");
  assert.equal(wall.updates.length, 1);
  assert.equal(wall.updates[0].options.thresholdSync, true);
  assert.equal(wall._source.sight, SENSE.NONE);
  assert.equal(wall._source.door, 1);
  assert.equal(wall.getFlag("threshold", "barrier").profile, "gate");
  assert.equal(wall.getFlag("threshold", "nativeBackup").sight, SENSE.NORMAL);
});

test("re-attaching replaces the profile without leaking old overrides", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "curtained-window");
  await manager.attach(wall, "bars");
  const barrier = wall.getFlag("threshold", "barrier");
  assert.equal(barrier.profile, "bars");
  assert.ok(Object.values(barrier.stateOverrides).every(v => v === null));
  // The backup still describes the wall as it was before Threshold touched it.
  assert.equal(wall.getFlag("threshold", "nativeBackup").sight, SENSE.NORMAL);
});

test("remove restores the original native wall", async () => {
  const wall = new MockWall({ sound: 10 });
  await manager.attach(wall, "glass-door");
  await manager.remove(wall);
  assert.equal(wall._source.sight, 20);
  assert.equal(wall._source.sound, 10);
  assert.equal(wall._source.door, 0);
  assert.equal(wall.getFlag("threshold", "barrier"), undefined);
  assert.equal(wall.getFlag("threshold", "nativeBackup"), undefined);
});

test("closing an ajar door with the native control restores full blocking", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door", { state: "ajar" });
  assert.equal(wall._source.sight, SENSE.LIMITED);
  // Player opens the door with the canvas door control, then closes it.
  wall._source.ds = 1;
  await manager.handleNativeDoorChange(wall);
  assert.equal(wall.getFlag("threshold", "barrier").state, "open");
  wall._source.ds = 0;
  await manager.handleNativeDoorChange(wall);
  assert.equal(wall.getFlag("threshold", "barrier").state, "closed");
  assert.equal(wall._source.sight, SENSE.NORMAL);
});

test("with native sync disabled only metadata is written", async () => {
  manager = new BarrierManager({ profiles, adapter, syncEnabled: () => false });
  const wall = new MockWall();
  await manager.attach(wall, "gate");
  assert.equal(wall._source.sight, SENSE.NORMAL);
  assert.equal(wall.getFlag("threshold", "barrier").profile, "gate");
});

test("players cannot modify barriers directly", async () => {
  installFoundryMock({ isGM: false });
  await assert.rejects(manager.attach(new MockWall(), "gate"), /Only a GM/);
});

test("unknown profile ids are rejected", async () => {
  await assert.rejects(manager.attach(new MockWall(), "portcullis"), /Unknown barrier profile/);
});

test("damage lowers durability and breaks the barrier at zero", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  let barrier = await manager.damage(wall, 12);
  assert.equal(barrier.integrity.current, 18);
  assert.equal(barrier.state, "closed");
  barrier = await manager.damage(wall, 100);
  assert.equal(barrier.integrity.current, 0);
  assert.equal(barrier.state, "damaged");
  assert.equal(wall._source.move, 0, "a broken door can be walked through");
  assert.equal(wall._source.sight, 0);
});

test("repair restores durability and closes a broken barrier", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door");
  await manager.damage(wall, 30);
  let barrier = await manager.repair(wall, 10);
  assert.equal(barrier.integrity.current, 10);
  assert.equal(barrier.state, "closed");
  assert.equal(wall._source.move, 20);
  barrier = await manager.repair(wall);
  assert.equal(barrier.integrity.current, null, "full durability is stored as null");
});

test("indestructible barriers refuse damage unless forced", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "solid-wall");
  await assert.rejects(manager.damage(wall, 5), /not destructible/);
  const barrier = await manager.damage(wall, 5, { force: true });
  assert.equal(barrier.integrity.current, 95);
});

test("barriers without durability cannot be damaged", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "force-field");
  await assert.rejects(manager.damage(wall, 5, { force: true }), /no durability/);
});

test("preDamage hook can change or cancel damage", async () => {
  const handlers = [];
  globalThis.Hooks = { call: (name, ctx) => { for (const h of handlers) if (h(ctx) === false) return false; return true; }, callAll: () => {} };
  try {
    const wall = new MockWall();
    await manager.attach(wall, "door");
    handlers.push(ctx => { ctx.amount -= ctx.barrier.material.hardness; });
    assert.equal((await manager.damage(wall, 10)).integrity.current, 23, "hardness 3 absorbed");
    handlers.push(() => false);
    assert.equal((await manager.damage(wall, 10)).integrity.current, 23, "cancelled");
  } finally {
    delete globalThis.Hooks;
  }
});

test("integrity above the maximum is rejected", () => {
  const errors = validateBarrier(makeBarrier(profiles.resolve("door"), { integrity: { current: 999 } }));
  assert.ok(errors.some(e => e.includes("exceeds")));
});

test("doors let sound through only when listening up close", () => {
  const data = nativeFor("door");
  assert.equal(data.sound, 30);
  assert.equal(data.threshold.sound, 5, "1 grid square at 5 units");
  assert.equal(data.threshold.attenuation, true);
});

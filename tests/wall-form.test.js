import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockWall, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { ProfileRegistry } = await import("../scripts/profiles/profile-registry.js");
const { FoundryV14Adapter } = await import("../scripts/adapters/foundry-v14.js");
const { BarrierManager } = await import("../scripts/core/barrier-manager.js");
const { applyFormToChanges, barrierFromForm, extractFormData } = await import("../scripts/ui/wall-form.js");

let deps, manager;
beforeEach(() => {
  installFoundryMock();
  const profiles = new ProfileRegistry();
  profiles.registerMany(readJSON("../profiles/barriers.json"), readJSON("../profiles/materials.json"));
  const adapter = new FoundryV14Adapter();
  deps = { profiles, adapter };
  manager = new BarrierManager({ profiles, adapter });
});

/** What the wall sheet submits: its own native fields plus the Threshold tab. */
const sheetUpdate = (ui, native = { move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }) =>
  ({ ...native, flags: { threshold: { ui } } });

/** Run the preUpdate rewrite, then apply the result the way Foundry would. */
async function submit(wall, changes) {
  const handled = applyFormToChanges(wall, changes, deps);
  await wall.update(changes);
  return { handled, changes };
}

test("updates that do not come from the tab are left alone", () => {
  const changes = { ds: 1 };
  assert.equal(applyFormToChanges(new MockWall(), changes, deps), false);
  assert.deepEqual(changes, { ds: 1 });
});

test("dotted form keys are extracted as well as expanded ones", () => {
  const changes = { "flags.threshold.ui.profile": "gate", "flags.threshold.ui.channels.vision": "blocked", move: 20 };
  assert.deepEqual(extractFormData(changes), { profile: "gate", channels: { vision: "blocked" } });
  assert.deepEqual(changes, { move: 20 });
});

test("choosing a profile on the tab stores it and overrides the sheet's native fields", async () => {
  const wall = new MockWall();
  const { changes } = await submit(wall, sheetUpdate({ profile: "gate" }));
  assert.equal(changes.flags.threshold.ui, undefined, "tab data is never stored");
  assert.equal(wall.getFlag("threshold", "barrier").profile, "gate");
  assert.equal(wall._source.sight, 0);
  assert.equal(wall._source.door, 1);
  assert.equal(wall.getFlag("threshold", "nativeBackup").sight, 20);
});

test("tab edits customise the chosen profile", async () => {
  const wall = new MockWall();
  await submit(wall, sheetUpdate({
    profile: "window", state: "closed",
    channels: { sound: "blocked" }, thresholds: { vision: "2" },
    material: { id: "reinforced-glass", durability: "" }
  }));
  const barrier = wall.getFlag("threshold", "barrier");
  assert.equal(barrier.channels.sound, "blocked");
  assert.equal(barrier.thresholds.vision, 2);
  assert.equal(barrier.material.id, "reinforced-glass");
  assert.equal(barrier.material.hardness, 8);
  assert.equal(barrier.material.durability, null);
  assert.equal(wall._source.threshold.sight, 10, "2 grid squares at 5 units each");
  assert.ok(barrier.stateOverrides.damaged, "profile state overrides are kept");
});

test("ajar is corrected to closed when the door control is set to none", () => {
  const barrier = barrierFromForm({ profile: "door", state: "ajar", interaction: { door: "none" } }, null, deps.profiles);
  assert.equal(barrier.state, "closed");
});

test("switching profile on the tab drops the previous profile's overrides", async () => {
  const wall = new MockWall();
  await submit(wall, sheetUpdate({ profile: "curtained-window" }));
  await submit(wall, sheetUpdate({ profile: "bars" }));
  const barrier = wall.getFlag("threshold", "barrier");
  assert.equal(barrier.profile, "bars");
  assert.equal(barrier.stateOverrides.open, null);
});

test("re-saving keeps customisations made through the API", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door", { stateOverrides: { damaged: { movement: "passable" } } });
  await submit(wall, sheetUpdate({ profile: "door", state: "damaged" }));
  assert.equal(wall.getFlag("threshold", "barrier").stateOverrides.damaged.movement, "passable");
  assert.equal(wall._source.move, 0);
});

test("clearing the profile restores the original wall", async () => {
  const wall = new MockWall({ sound: 10 });
  await submit(wall, sheetUpdate({ profile: "glass-door" }));
  await submit(wall, sheetUpdate({ profile: "" }, {}));
  assert.equal(wall.getFlag("threshold", "barrier"), null);
  assert.equal(wall.getFlag("threshold", "nativeBackup"), null);
  assert.equal(wall._source.sight, 20);
  assert.equal(wall._source.sound, 10);
  assert.equal(manager.has(wall), false);
  // Attaching again takes a fresh backup.
  await submit(wall, sheetUpdate({ profile: "bars" }));
  assert.equal(wall.getFlag("threshold", "nativeBackup").sound, 10);
});

test("saving with no profile on a plain wall changes nothing", async () => {
  const wall = new MockWall();
  const { handled, changes } = await submit(wall, sheetUpdate({ profile: "" }, { move: 0 }));
  assert.equal(handled, true);
  assert.equal(changes.move, 0, "sheet's own native edit goes through");
  assert.equal(wall.getFlag("threshold", "barrier"), undefined);
});

test("with native sync off the sheet's native values are kept", async () => {
  deps.syncEnabled = () => false;
  const wall = new MockWall();
  await submit(wall, sheetUpdate({ profile: "gate" }, { sight: 20 }));
  assert.equal(wall._source.sight, 20);
  assert.equal(wall.getFlag("threshold", "barrier").profile, "gate");
});

test("unknown profiles are rejected so the hook can cancel the save", () => {
  assert.throws(() => applyFormToChanges(new MockWall(), sheetUpdate({ profile: "portcullis" }), deps), /Unknown barrier profile/);
});

const emptyOverrides = () => Object.fromEntries(["open", "ajar", "locked", "damaged"]
  .map(s => [s, Object.fromEntries(["movement", "vision", "light", "sound", "cover", "ballistic"].map(c => [c, ""]))]));

test("state overrides edited on the tab are stored and applied", async () => {
  const wall = new MockWall();
  const stateOverrides = emptyOverrides();
  stateOverrides.damaged.movement = "passable";
  stateOverrides.damaged.vision = "transparent";
  await submit(wall, sheetUpdate({ profile: "door", state: "damaged", stateOverrides }));
  const barrier = wall.getFlag("threshold", "barrier");
  assert.equal(barrier.stateOverrides.damaged.movement, "passable");
  assert.equal(barrier.stateOverrides.damaged.light, null);
  assert.equal(barrier.stateOverrides.open, null);
  assert.equal(wall._source.move, 0);
  assert.equal(wall._source.sight, 0);
  assert.equal(wall._source.light, 20, "channels without an override keep the base value");
});

test("emptying the selects removes a profile's own override", async () => {
  const wall = new MockWall();
  await submit(wall, sheetUpdate({ profile: "curtained-window", state: "open", stateOverrides: emptyOverrides() }));
  const barrier = wall.getFlag("threshold", "barrier");
  assert.equal(barrier.stateOverrides.open, null);
  assert.equal(wall._source.move, 0, "open without override is fully passable");
});

test("the profile's overrides are kept when the tab leaves them unchanged", async () => {
  const wall = new MockWall();
  const stateOverrides = emptyOverrides();
  Object.assign(stateOverrides.open, { movement: "blocked", vision: "proximity", light: "transmitted", ballistic: "blocked" });
  await submit(wall, sheetUpdate({ profile: "curtained-window", state: "open", stateOverrides }));
  assert.equal(wall._source.move, 20);
  assert.equal(wall._source.sight, 30);
});

test("a closed-state override set through the API survives saving the tab", async () => {
  const wall = new MockWall();
  await manager.attach(wall, "door", { stateOverrides: { closed: { sound: "blocked" } } });
  await submit(wall, sheetUpdate({ profile: "door", stateOverrides: emptyOverrides() }));
  assert.equal(wall.getFlag("threshold", "barrier").stateOverrides.closed.sound, "blocked");
});

test("invalid override values are ignored rather than stored", () => {
  const stateOverrides = emptyOverrides();
  stateOverrides.open.vision = "x-ray";
  const barrier = barrierFromForm({ profile: "door", stateOverrides }, null, deps.profiles);
  assert.equal(barrier.stateOverrides.open, null);
});

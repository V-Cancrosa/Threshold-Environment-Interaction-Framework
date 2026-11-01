# Threshold — Environment Interaction Framework

*Advanced spatial barriers, perception and environmental interaction for Foundry VTT.*

> Formerly developed under the internal codename **Universal Barrier System (UBS)**.

**Version:** 0.8.0 · **Target:** Foundry Virtual Tabletop V14 · **Status:** early development

Threshold is a system-agnostic layer over native Foundry walls. A wall gets a **barrier profile**: independent channels for movement, vision, light, sound, cover and ballistics, plus a state, a material and interaction rules. Threshold works out which channels apply in the current state and writes them to the wall's native settings, so Foundry's own movement and vision engine keeps doing the actual work.

## Installation

In Foundry: **Add-on Modules → Install Module**, then paste this manifest URL:

```
https://github.com/V-Cancrosa/Threshold-Environment-Interaction-Framework/releases/latest/download/module.json
```

Enable **Threshold — Environment Interaction Framework** in your world's Manage Modules.

## Configuring a wall

Double-click a wall (or right-click → configure) as a GM. The wall sheet gets two tabs:

- **Wall:** Foundry's own settings. While a Threshold profile is active, the movement, sight, light, sound and door fields are locked, and a notice says which profile controls them.
- **Threshold:** a wall that already has a profile opens on this tab. At the top: the **barrier profile**, door control, current state, and a **state matrix** with each channel's behaviour (rows) in every state (columns), coloured from blocks to lets through. The current state is outlined, and a dot marks a value overridden for that state. Click a state's column to edit it.
- Below are three collapsible sections:
  - **What gets through:** the base channels for the closed barrier, plus proximity range (in grid squares) and attenuation.
  - **Opening ajar** (doors only): physical opening on/off, how far ajar (degrees, or % slid back for sliding doors), which end is the hinge, swing direction, and from what gap tokens can pass. A schematic shows the leaf, the frame and whether a helper wall is in place.
  - **Behaviour in other states:** for Open, Ajar, Locked and Damaged, set what each channel does. Every field starts at **Default (…)**, which shows what the built-in rule gives; pick a value to override it. Ajar and Locked are available only for doors.
  - **Appearance:** the barrier's texture on the map: pick one of the bundled textures or browse for any image. Doors also choose an animation (swing, slide, ascend, descend) and double door; other barriers choose thickness and whether the texture repeats every grid square. Each state can show its own texture (in **Behaviour in other states**): same as closed, nothing, or a custom image.
  - **Material and interaction:** material, current and maximum durability (with a bar), and whether players can operate, lock or destroy the barrier.

Proximity ranges are entered in **grid squares** so profiles work in any system; the sheet shows each range in scene units (e.g. `= 5 ft`) and flags ranges that no channel uses.

Click **Update Wall** to save the profile and the matching native settings in one update. Set the profile back to **None** and save to restore the wall's original settings.

## Console API

As a GM, select one or more walls, open the browser console (F12) and run:

```js
const thr = game.modules.get("threshold").api;

await thr.apply("gate");                // selected walls become a see-through gate
thr.profiles.list();                    // all available profiles

const wall = thr.foundry.getSelectedWalls()[0];
await thr.barriers.setState(wall, "ajar");   // closed | open | ajar | locked | damaged
thr.barriers.get(wall);                      // read the stored profile
await thr.barriers.remove(wall);             // restore the wall exactly as it was
```

Players can open and close Threshold doors with Foundry's normal door controls. The active GM's client picks up the change and updates the barrier state, so, for example, closing a door that was ajar restores full vision blocking.

## Bundled profiles

| Profile | Movement | Vision | Light | Sound | Notes |
|---|---|---|---|---|---|
| `solid-wall` | blocked | blocked | blocked | attenuated | stone |
| `partition` | blocked | blocked | blocked | transmitted | thin wall; broken → passable |
| `door` | blocked | blocked | blocked | proximity 1 | wooden door; hear through it only up close; broken → passable |
| `reinforced-door` | blocked | blocked | blocked | blocked | steel |
| `secret-door` | blocked | blocked | blocked | proximity ½ | native secret door |
| `gate` | blocked | transparent | transmitted | transmitted | bars you can open (furtka) |
| `glass-door` | blocked | transparent | transmitted | proximity 2 | |
| `frosted-glass-door` | blocked | blocked | transmitted | proximity 2 | lets light in, not sight |
| `window` | blocked | proximity 1 | transmitted | proximity 2 | breaking it (`damaged`) clears the view |
| `curtained-window` | blocked | blocked | limited | attenuated | `open` = curtains drawn back (vision proximity 1) |
| `armored-glass` | blocked | transparent | transmitted | blocked | stops bullets |
| `bars` | blocked | transparent | transmitted | transmitted | fixed bars |
| `viewing-slot` | blocked | proximity ½ | limited | attenuated | peephole / arrow slit: eye to the slot |
| `force-field` | blocked | transparent | transmitted | blocked | `damaged` = field down |
| `barricade` | blocked | transparent | transmitted | transmitted | partial cover, destructible |

Proximity values are in grid squares. Sound proximity uses attenuation, so it fades rather than cutting off.

Customise any profile when attaching it:

```js
await thr.apply("window", undefined, { thresholds: { vision: 2 } });  // see through within 2 grid squares
```

## Opening doors ajar

Door profiles use **physical opening**: when a door stands ajar, Threshold really moves the wall. A swinging leaf rotates around its hinge (up to 90°), a sliding leaf retracts into the frame. The leaf blocks as a closed door would, and Foundry's own vision works out what can be seen, lit or heard through the actual gap. The door's texture moves with the leaf.

```js
await thr.ajar(0.33);                       // first selected door, ~30°
await thr.barriers.setAjar(wall, 0.5);      // 45°, or half slid back
```

- **Movement:** Foundry tests movement along a single line from the token's centre, so a crack would let any token through. While the gap is narrower than **Passable from a gap of** (default 1 grid square), Threshold keeps a movement-only helper wall in the door frame. Helper walls are created, moved and deleted with their door; their sheet says so.
- **Door controls:** clicking an ajar door's control opens it fully (the leaf goes back to the frame and Foundry's door animation plays); clicking again closes it.
- **Moving a door by hand:** dragging an endpoint of a physical door makes the new position its closed position (an ajar door is closed first).
- Turn physical opening off to fall back to the approximation (ajar = limited sight, sound passes).

## Textures

Most profiles come with a texture (16 bundled SVGs in `assets/textures/`, made for this module):

- **Doors** use Foundry's own animated door: Threshold sets the wall's door animation texture and type, so the texture swings or slides when the door opens. A damaged door switches to its broken texture (or none).
- **Other barriers** (bars, windows, curtains, armored glass, viewing slot, force field, barricade) are drawn by Threshold in the map layer, above tiles and below tokens, so fog of war hides them like tiles. A broken window shows shards, a damaged force field disappears, curtains drawn back show the window.

Clearing a door's texture gives the wall back the animation it had before Threshold.

## Durability and damage

Destructible barriers with a maximum durability (from their material, e.g. wood 30, glass 15) can be damaged:

```js
await thr.damage(10);              // first selected wall
await thr.repair(5);               // or thr.repair() to restore fully
await thr.barriers.damage(wall, 10, { source: actor });
```

At 0 the barrier switches to **Damaged** (a broken door or window becomes passable); repairing it above 0 returns it to **Closed**. Indestructible barriers refuse damage unless you pass `{ force: true }`.

A durability bar is drawn on the map under each destructible barrier. The **Durability bars on the map** setting chooses who sees them: nobody, the GM only (default), or GM and players (players only see bars at spots they can see).

System adapters can hook in:

```js
Hooks.on("threshold.preDamage", ctx => { ctx.amount -= ctx.barrier.material.hardness; }); // or return false to cancel
Hooks.on("threshold.broken", (wall, barrier) => { /* play a sound, post to chat… */ });
```

## How states work

- **closed / locked:** the profile's base channels apply. For door-type barriers, `locked` is also the native locked state.
- **open:** everything passes, unless the profile defines a `stateOverrides.open` (as `curtained-window` does).
- **ajar:** each channel becomes the less restrictive of the closed value and a narrow gap (movement blocked, vision and light limited, sound passes). A gate left ajar therefore stays see-through.
- **damaged:** the base channels apply unless the profile defines `stateOverrides.damaged` (window, barricade, force field).

`ajar` and `locked` only apply to barriers with `interaction.door` set to `"door"` or `"secret"`.

## Channel → native wall mapping

| Threshold value | Native Foundry setting |
|---|---|
| movement `blocked` / `passable` | Movement: Normal / None |
| `blocked` | Sense: Normal |
| `limited`, sound `attenuated` | Sense: Limited (blocks only when two limited walls overlap) |
| `proximity` / `distance` | Sense: Proximity / Distance, with the threshold converted from grid units to scene units |
| `transparent` / `transmitted` | Sense: None |
| `cover`, `ballistic` | No native equivalent; stored for system adapters |

When a barrier is first attached, Threshold saves a backup of the wall's native settings, and `remove()` puts them back. The **Apply profiles to native walls** setting turns native writes off, so profiles are stored as metadata only.

## For system and world developers

```js
Hooks.on("threshold.registerProfiles", registry => {
  registry.registerMaterial("ceramite", { label: "Ceramite", durability: 200, hardness: 15 });
  registry.register("blast-door", {
    type: "door",
    material: { id: "ceramite" },
    channels: { movement: "blocked", vision: "blocked", light: "blocked", sound: "blocked", cover: "full", ballistic: "blocked" },
    interaction: { door: "door", lockable: true }
  });
});

Hooks.on("threshold.ready", api => { /* API is available */ });
```

Barrier data is stored on the wall at `flags.threshold.barrier`. Every Threshold write passes the update option `thresholdSync: true`.

## Not implemented yet

- A dedicated drawing tool and a quick profile switcher on the canvas.
- Player interaction with non-door barriers (curtains, etc.) via a GM-validated socket request.
- Segment openings (e.g. a door with a viewing slot as one object).
- Setting ajar from the canvas (e.g. a modifier-click on the door icon), and for players through a GM-validated request.
- Cover, ballistic and system adapters (D&D 5e, Cyberpunk RED, WFRP…).

## Development

```bash
npm test
```

Tests use Node's built-in test runner and a minimal mock of Foundry; nothing needs installing. Pushing to `main` with a new `version` in `module.json` runs the tests and publishes a GitHub release automatically.

## License

All rights reserved pending project licensing decision.

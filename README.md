# Threshold — Environment Interaction Framework

*Advanced spatial barriers, perception and environmental interaction for Foundry VTT.*

> Formerly developed under the internal codename **Universal Barrier System (UBS)**.

**Version:** 0.5.0 · **Target:** Foundry Virtual Tabletop V14 · **Status:** early development

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
- **Threshold:** pick a **barrier profile**, then adjust anything for this particular wall: door control, state, each channel, proximity range (in grid squares), material, durability and interaction flags. A live preview shows what the barrier lets through in the chosen state.
- **Behaviour in other states** (on the Threshold tab): for Open, Ajar, Locked and Damaged, set what each channel does in that state. Every field starts at **Default (…)**, which shows what the built-in rule gives; pick a value to override it. States with overrides are marked with a dot, and Ajar/Locked are available only for doors.

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
| `partition` | blocked | blocked | blocked | transmitted | thin wall, destructible |
| `door` | blocked | blocked | blocked | attenuated | wooden door, lockable |
| `reinforced-door` | blocked | blocked | blocked | blocked | steel |
| `secret-door` | blocked | blocked | blocked | attenuated | native secret door |
| `gate` | blocked | transparent | transmitted | transmitted | bars you can open (furtka) |
| `glass-door` | blocked | transparent | transmitted | attenuated | |
| `frosted-glass-door` | blocked | blocked | transmitted | attenuated | lets light in, not sight |
| `window` | blocked | proximity (1 grid) | transmitted | attenuated | breaking it (`damaged`) clears the view |
| `curtained-window` | blocked | blocked | limited | attenuated | `open` = curtains drawn back |
| `armored-glass` | blocked | transparent | transmitted | blocked | stops bullets |
| `bars` | blocked | transparent | transmitted | transmitted | fixed bars |
| `viewing-slot` | blocked | limited | limited | attenuated | peephole / arrow slit |
| `force-field` | blocked | transparent | transmitted | blocked | `damaged` = field down |
| `barricade` | blocked | transparent | transmitted | transmitted | partial cover, destructible |

Customise any profile when attaching it:

```js
await thr.apply("window", undefined, { thresholds: { vision: 2 } });  // see through within 2 grid squares
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
- Door leaf rotation on the canvas and opening by a given angle.
- Durability, damage and destruction workflows.
- Cover, ballistic and system adapters (D&D 5e, Cyberpunk RED, WFRP…).

## Development

```bash
npm test
```

Tests use Node's built-in test runner and a minimal mock of Foundry; nothing needs installing. Pushing to `main` with a new `version` in `module.json` runs the tests and publishes a GitHub release automatically.

## License

All rights reserved pending project licensing decision.

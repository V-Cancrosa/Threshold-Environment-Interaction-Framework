# Threshold — Environment Interaction Framework

*Advanced spatial barriers, perception and environmental interaction for Foundry VTT.*

> Formerly developed under the internal codename **Universal Barrier System (UBS)**.

**Prototype:** 0.1.0-alpha.1  
**Target:** Foundry Virtual Tabletop V14  
**Status:** Development scaffold — not yet a feature-complete playable module.

Threshold is designed as a system-agnostic extension layer for native Foundry walls. The first prototype establishes module loading, namespaced wall flags, validated barrier profiles, geometry helpers, property evaluation, and a narrow Foundry V14 adapter.

## Installation

1. Extract the module into `Data/modules/threshold/` (the folder name must match the module ID `threshold`).
2. Confirm that `module.json` is directly inside that folder.
3. Start a V14 world and enable **Threshold** in Manage Modules.
4. Open the browser developer console. The prototype API is exposed at:

```js
game.modules.get("threshold").api
```

## Prototype API

Select a wall in the scene, then use the following from the developer console as a GM:

```js
const api = game.modules.get("threshold").api;
const wall = api.foundry.getSelectedWalls()[0];

// Attach a transparent-barrier profile to the selected native wall.
await api.barriers.attach(wall, {
  type: "window",
  profile: "transparent-barrier",
  channels: {
    movement: "blocked",
    vision: "transparent",
    light: "transmitted",
    sound: "attenuated",
    cover: "partial",
    ballistic: "blocked"
  }
});

// Read the Threshold profile.
api.barriers.get(wall);

// Remove only the Threshold metadata; this does not delete the native wall.
await api.barriers.remove(wall);
```

**Important:** in this alpha scaffold, attaching a profile stores metadata only. It does not yet alter native wall perception or collision. This is deliberate: mapping each Threshold channel to V14's native wall model must be implemented and tested before profiles can safely affect live scenes.

## Current contents

- `module.json`: V14 package manifest and ES module entry point.
- `scripts/core/`: module lifecycle, defaults, validation, and flag-based barrier manager.
- `scripts/geometry/`: basic hinged-door geometry helper.
- `scripts/properties/`: pure Movement/Vision property evaluation.
- `scripts/interactions/`: initial interaction policy and door state helper.
- `scripts/adapters/`: narrow Foundry V14 adapter for selected native walls.
- `profiles/`: starter material and barrier profile data.
- `lang/`: English and Polish localization stubs.

## Not implemented yet

- Wall configuration sheet integration.
- Dedicated Threshold drawing/editing mode.
- Native wall channel mapping and synchronization.
- Segment openings and generated wall segments.
- Real door leaf rotation on the canvas.
- Player-to-GM socket request workflow.
- Token-size-aware movement through openings.
- Cover, ballistic, sound, and system adapters.

## Development principles

1. Native Foundry walls remain authoritative for core movement and perception wherever possible.
2. Threshold metadata is stored under `flags.threshold.barrier`.
3. Do not mutate Foundry internals or globally replace perception algorithms in the MVP.
4. Player requests must be validated by an authoritative GM client before changing scene documents.
5. Profiles describe intent; adapters translate that intent into Foundry-native behavior.

## License

All rights reserved pending project licensing decision.

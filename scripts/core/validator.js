import { GEOMETRY_MODES, DOOR_ANIMATIONS, BARRIER_TYPES, CHANNELS, CHANNEL_VALUES, DOOR_MODES, SCHEMA_VERSION, STATES, THRESHOLD_CHANNELS } from "./constants.js";

function checkChannels(channels, path, errors, { partial = false } = {}) {
  if (!channels || typeof channels !== "object") {
    errors.push(`${path} must be an object.`);
    return;
  }
  for (const channel of CHANNELS) {
    if (!(channel in channels)) {
      if (!partial) errors.push(`Missing channel: ${path}.${channel}`);
      continue;
    }
    if (partial && channels[channel] === null) continue;
    if (!CHANNEL_VALUES[channel].includes(channels[channel])) {
      errors.push(`Invalid value for ${path}.${channel}: ${channels[channel]} (allowed: ${CHANNEL_VALUES[channel].join(", ")})`);
    }
  }
  for (const key of Object.keys(channels)) {
    if (!CHANNELS.includes(key)) errors.push(`Unknown channel: ${path}.${key}`);
  }
}

export function validateBarrier(data) {
  const errors = [];
  if (!data || typeof data !== "object") return ["Barrier data must be an object."];
  if (data.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schema version: ${data.schemaVersion}`);
  if (!BARRIER_TYPES.includes(data.type)) errors.push(`Invalid barrier type: ${data.type}`);
  if (!STATES.includes(data.state)) errors.push(`Invalid state: ${data.state}`);

  checkChannels(data.channels, "channels", errors);
  for (const [state, override] of Object.entries(data.stateOverrides ?? {})) {
    if (!STATES.includes(state)) errors.push(`Invalid state in stateOverrides: ${state}`);
    if (override === null) continue;
    checkChannels(override, `stateOverrides.${state}`, errors, { partial: true });
  }

  for (const channel of THRESHOLD_CHANNELS) {
    const value = data.thresholds?.[channel];
    if (value !== null && value !== undefined && !(typeof value === "number" && value >= 0)) {
      errors.push(`thresholds.${channel} must be null or a non-negative number of grid units.`);
    }
  }

  const door = data.interaction?.door ?? "none";
  if (!DOOR_MODES.includes(door)) errors.push(`Invalid interaction.door: ${door}`);
  if (door === "none" && ["ajar", "locked"].includes(data.state)) {
    errors.push(`State "${data.state}" requires interaction.door to be "door" or "secret".`);
  }

  const max = data.material?.durability;
  if (max !== null && max !== undefined && !(typeof max === "number" && max >= 0)) {
    errors.push("material.durability must be null or a non-negative number.");
  }
  const current = data.integrity?.current;
  if (current !== null && current !== undefined) {
    if (typeof current !== "number" || current < 0) errors.push("integrity.current must be null or a non-negative number.");
    else if (typeof max !== "number") errors.push("integrity.current requires material.durability.");
    else if (current > max) errors.push(`integrity.current (${current}) exceeds material.durability (${max}).`);
  }

  const appearance = data.appearance ?? {};
  const isPath = v => v === null || v === undefined || typeof v === "string";
  if (!isPath(appearance.texture)) errors.push("appearance.texture must be a path or null.");
  for (const [state, value] of Object.entries(appearance.stateTextures ?? {})) {
    if (!STATES.includes(state)) errors.push(`Invalid state in appearance.stateTextures: ${state}`);
    if (!isPath(value)) errors.push(`appearance.stateTextures.${state} must be a path, "" or null.`);
  }
  if (appearance.animation !== undefined && !DOOR_ANIMATIONS.includes(appearance.animation)) {
    errors.push(`Invalid appearance.animation: ${appearance.animation}`);
  }
  if (appearance.repeat !== undefined && typeof appearance.repeat !== "boolean") errors.push("appearance.repeat must be true or false.");
  if (appearance.thickness !== undefined && !(typeof appearance.thickness === "number" && appearance.thickness > 0 && appearance.thickness <= 2)) {
    errors.push("appearance.thickness must be a number of grid squares between 0 and 2.");
  }

  const g = data.geometry ?? {};
  const fraction = g.openFraction;
  if (typeof fraction !== "number" || fraction < 0 || fraction > 1) {
    errors.push("geometry.openFraction must be a number from 0 to 1.");
  }
  if (g.mode !== undefined && !GEOMETRY_MODES.includes(g.mode)) errors.push(`Invalid geometry.mode: ${g.mode}`);
  if (g.hinge !== undefined && !["a", "b"].includes(g.hinge)) errors.push(`geometry.hinge must be "a" or "b".`);
  if (g.swing !== undefined && ![1, -1].includes(g.swing)) errors.push("geometry.swing must be 1 or -1.");
  if (g.passableGap !== undefined && !(typeof g.passableGap === "number" && g.passableGap >= 0)) {
    errors.push("geometry.passableGap must be a non-negative number of grid squares.");
  }
  if (g.closedC != null && !(Array.isArray(g.closedC) && g.closedC.length === 4 && g.closedC.every(Number.isFinite))) {
    errors.push("geometry.closedC must be null or four coordinates.");
  }
  return errors;
}

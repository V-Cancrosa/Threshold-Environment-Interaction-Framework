import { BARRIER_TYPES, CHANNELS, CHANNEL_VALUES, DOOR_MODES, SCHEMA_VERSION, STATES, THRESHOLD_CHANNELS } from "./constants.js";

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

  const fraction = data.geometry?.openFraction;
  if (typeof fraction !== "number" || fraction < 0 || fraction > 1) {
    errors.push("geometry.openFraction must be a number from 0 to 1.");
  }
  return errors;
}

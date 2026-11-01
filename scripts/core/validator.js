import { BARRIER_TYPES, CHANNELS, SCHEMA_VERSION, STATES } from "./constants.js";

export function validateBarrier(data) {
  const errors = [];
  if (!data || typeof data !== "object") return ["Barrier data must be an object."];
  if (data.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schema version: ${data.schemaVersion}`);
  if (!BARRIER_TYPES.includes(data.type)) errors.push(`Invalid barrier type: ${data.type}`);
  if (!STATES.includes(data.state)) errors.push(`Invalid state: ${data.state}`);
  for (const channel of CHANNELS) {
    if (!(channel in (data.channels ?? {}))) errors.push(`Missing channel: ${channel}`);
  }
  const fraction = data.geometry?.openFraction;
  if (typeof fraction !== "number" || fraction < 0 || fraction > 1) {
    errors.push("geometry.openFraction must be a number from 0 to 1.");
  }
  return errors;
}

// Minimal stand-ins for the Foundry globals Threshold touches, enough for unit tests.
import { readFileSync } from "node:fs";

const isObject = v => v && typeof v === "object" && !Array.isArray(v);

function mergeObject(original, other) {
  const out = structuredClone(original);
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (isObject(value) && isObject(target[key])) merge(target[key], value);
      else target[key] = structuredClone(value);
    }
  };
  merge(out, other);
  return out;
}

function setProperty(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = isObject(value) && isObject(target[last]) ? mergeObject(target[last], value) : structuredClone(value);
}

function setPlain(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = value;
}

export function installFoundryMock({ isGM = true } = {}) {
  globalThis.foundry = { utils: { deepClone: v => structuredClone(v), mergeObject, setProperty: (o, k, v) => { setPlain(o, k, v); return true; } } };
  globalThis.game = { user: { isGM } };
  globalThis.canvas = { scene: { grid: { distance: 5 } }, walls: { controlled: [] } };
}

/** A WallDocument-like object storing native fields on _source and flags under flags. */
export class MockWall {
  constructor(source = {}) {
    this.id = "wall1";
    this._source = { c: [0, 0, 100, 0], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0, threshold: { sight: null, light: null, sound: null, attenuation: false }, animation: null, flags: {}, ...source };
    this.updates = [];
  }
  get ds() { return this._source.ds; }
  get c() { return this._source.c; }
  getFlag(scope, key) { return this._source.flags[scope]?.[key]; }
  async setFlag(scope, key, value) { (this._source.flags[scope] ??= {})[key] = structuredClone(value); }
  async unsetFlag(scope, key) { delete this._source.flags[scope]?.[key]; }
  async update(changes, options = {}) {
    this.updates.push({ changes: structuredClone(changes), options });
    for (const [path, value] of Object.entries(changes)) setProperty(this._source, path, value);
  }
}

export function readJSON(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

/** A scene holding MockWalls, with the embedded-document calls HelperWalls uses. */
export class MockScene {
  constructor(walls = []) {
    this.grid = { size: 100 };
    this.walls = [];
    this.nextId = 1;
    for (const w of walls) this.add(w);
  }
  add(wall) {
    wall.parent = this;
    this.walls.push(wall);
    return wall;
  }
  async createEmbeddedDocuments(type, data) {
    return data.map(d => {
      const { flags = {}, ...rest } = d;
      const wall = new MockWall(rest);
      wall.id = `helper${this.nextId++}`;
      wall._source.flags = structuredClone(flags);
      return this.add(wall);
    });
  }
  async deleteEmbeddedDocuments(type, ids) {
    this.walls = this.walls.filter(w => !ids.includes(w.id));
  }
}

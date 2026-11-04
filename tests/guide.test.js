import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFoundryMock, readJSON } from "./foundry-mock.js";

installFoundryMock();
const { compareVersions, entriesToShow, entryLines, renderGuideHTML, shouldShowWelcome } = await import("../scripts/ui/guide.js");
const { MODULE_VERSION } = await import("../scripts/core/constants.js");

const changelog = readJSON("../docs/changelog.json");
const moduleJson = readJSON("../module.json");
const guide = lang => readFileSync(new URL(`../docs/guide.${lang}.html`, import.meta.url), "utf8");

test("version comparison", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0, "numeric, not string, order");
  assert.ok(compareVersions("0.2.0-alpha.1", "0.2.0") < 0, "pre-release before release");
  assert.ok(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.10") < 0);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("welcome shows on first run and after an update, not otherwise", () => {
  assert.equal(shouldShowWelcome("0.10.0", null), true);
  assert.equal(shouldShowWelcome("0.10.0", "0.9.0"), true);
  assert.equal(shouldShowWelcome("0.10.0", "0.10.0"), false);
  assert.equal(shouldShowWelcome("0.10.0", "0.9.0", false), false, "turned off by the user");
});

test("news: current version first, then the versions the user skipped", () => {
  const { latest, earlier } = entriesToShow(changelog, "0.9.0", "0.7.0");
  assert.equal(latest.version, "0.9.0");
  assert.deepEqual(earlier.map(e => e.version), ["0.8.0", "0.7.1"]);
  assert.deepEqual(entriesToShow(changelog, "0.9.0", null).earlier, [], "first install: no backlog");
});

test("players only get their own lines", () => {
  const entry = changelog.find(e => e.version === "0.9.0");
  assert.equal(entryLines(entry, "pl", false).length, 1);
  assert.ok(entryLines(entry, "pl", true).length > 1);
  assert.deepEqual(entryLines(changelog.find(e => e.version === "0.7.1"), "en", false), []);
});

test("the changelog has an entry for the module's version, in both languages", () => {
  assert.equal(moduleJson.version, MODULE_VERSION, "module.json and constants.js agree");
  const entry = changelog.find(e => e.version === MODULE_VERSION);
  assert.ok(entry, `docs/changelog.json needs an entry for ${MODULE_VERSION}`);
  for (const lang of ["pl", "en"]) assert.ok(entry[lang]?.gm?.length, `${lang} GM lines`);
});

test("both guides have the same chapters with the same audience", () => {
  const sections = html => [...html.matchAll(/data-guide-section="([^"]+)" data-audience="([^"]+)"/g)].map(m => `${m[1]}:${m[2]}`);
  assert.deepEqual(sections(guide("pl")), sections(guide("en")));
  assert.ok(sections(guide("en")).includes("players:all"), "a chapter for players");
});

test("rendered window: news, guide and escaped version", () => {
  const html = renderGuideHTML({ changelog, guideHtml: "<section>guide</section>", lang: "pl", isGM: true, version: "0.9.0", lastSeen: "0.8.0", t: k => k });
  assert.match(html, /THRESHOLD.Guide.WhatsNew 0.9.0/);
  assert.match(html, /<section>guide<\/section>/);
  assert.doesNotMatch(html, /thr-guide-earlier/, "nothing skipped between 0.8.0 and 0.9.0");
  const players = renderGuideHTML({ changelog, guideHtml: "", lang: "pl", isGM: false, version: "0.7.1", lastSeen: null, t: k => k });
  assert.match(players, /THRESHOLD.Guide.NothingForPlayers/);
});

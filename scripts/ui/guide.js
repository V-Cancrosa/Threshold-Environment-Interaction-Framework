import { LOG_PREFIX, MODULE_ID, MODULE_VERSION } from "../core/constants.js";

const BASE = `modules/${MODULE_ID}/docs`;

/**
 * Compare versions like "0.10.0" or "0.1.0-alpha.1". A pre-release sorts before its
 * release. Returns <0, 0 or >0.
 */
export function compareVersions(a, b) {
  const parse = v => {
    const [main, pre = ""] = String(v ?? "").split("-");
    return { nums: main.split(".").map(n => parseInt(n, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true });
}

/**
 * Which changelog entries to show: the current version first, then the versions the
 * user skipped since they last saw the window (none on a first install).
 */
export function entriesToShow(changelog, current, lastSeen) {
  const sorted = [...changelog].sort((a, b) => compareVersions(b.version, a.version));
  const latest = sorted.find(e => compareVersions(e.version, current) === 0) ?? sorted.find(e => compareVersions(e.version, current) < 0) ?? null;
  const earlier = lastSeen
    ? sorted.filter(e => e !== latest && compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0)
    : [];
  return { latest, earlier };
}

/** Should the welcome window open by itself? */
export function shouldShowWelcome(current, lastSeen, enabled = true) {
  return Boolean(enabled) && (!lastSeen || compareVersions(current, lastSeen) > 0);
}

/** The lines of a changelog entry for one audience and language (players get only their own). */
export function entryLines(entry, lang, isGM) {
  const text = entry?.[lang] ?? entry?.en ?? {};
  return isGM ? [...(text.gm ?? [])] : [...(text.players ?? [])];
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The window's HTML. Changelog lines and the guide are the module's own files and may
 * contain markup; everything else is escaped.
 */
export function renderGuideHTML({ changelog, guideHtml, lang, isGM, version, lastSeen, t }) {
  const { latest, earlier } = entriesToShow(changelog, version, lastSeen);
  const list = entry => {
    const lines = entryLines(entry, lang, isGM);
    return lines.length ? `<ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul>` : `<p class="thr-guide-quiet">${esc(t("THRESHOLD.Guide.NothingForPlayers"))}</p>`;
  };
  const latestHtml = latest
    ? `<section class="thr-guide-news">
        <h2><i class="fa-solid fa-star"></i> ${esc(t("THRESHOLD.Guide.WhatsNew"))} ${esc(latest.version)}</h2>
        <p class="thr-guide-date">${esc(latest.date ?? "")}</p>
        ${list(latest)}
        ${earlier.length ? `<details class="thr-guide-earlier"><summary>${esc(t("THRESHOLD.Guide.Earlier"))} (${earlier.length})</summary>
          ${earlier.map(e => `<h3>${esc(e.version)} <span class="thr-guide-date">${esc(e.date ?? "")}</span></h3>${list(e)}`).join("")}
        </details>` : ""}
      </section>`
    : "";
  return `
    <header class="thr-guide-header">
      <div class="thr-guide-logo"><i class="fa-solid fa-dungeon"></i></div>
      <div>
        <h1>Threshold</h1>
        <p>${esc(t("THRESHOLD.Guide.Tagline"))} · v${esc(version)}</p>
      </div>
      <a class="thr-guide-link" href="https://github.com/V-Cancrosa/Threshold-Environment-Interaction-Framework" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>
    </header>
    ${latestHtml}
    <section class="thr-guide-manual">
      <h2 class="thr-guide-manual-title"><i class="fa-solid fa-book-open"></i> ${esc(t(isGM ? "THRESHOLD.Guide.Manual" : "THRESHOLD.Guide.PlayerManual"))}</h2>
      <nav class="thr-guide-toc"></nav>
      <div class="thr-guide-body">${guideHtml}</div>
    </section>`;
}

/**
 * Finish the rendered window in the DOM: drop GM-only chapters for players, build the
 * table of contents, and make its links scroll inside the window (a hash link would
 * change Foundry's URL).
 */
export function finishGuideDOM(root, { isGM }) {
  if (!isGM) for (const el of root.querySelectorAll('[data-audience="gm"]')) el.remove();
  const toc = root.querySelector(".thr-guide-toc");
  const headings = [...root.querySelectorAll(".thr-guide-body section > h2")];
  if (toc) {
    toc.hidden = headings.length < 2;
    toc.innerHTML = headings.map(h => `<a data-thr-goto="${h.id}">${esc(h.textContent)}</a>`).join("");
    toc.addEventListener("click", event => {
      const link = event.target.closest("[data-thr-goto]");
      if (!link) return;
      event.preventDefault();
      root.querySelector(`#${CSS.escape(link.dataset.thrGoto)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

/** Load the changelog and the guide in the user's language (falling back to English). */
export async function loadGuideContent(lang) {
  const changelog = JSON.parse(await fetchText(`${BASE}/changelog.json`));
  let guideHtml;
  try {
    guideHtml = await fetchText(`${BASE}/guide.${lang}.html`);
  } catch {
    guideHtml = await fetchText(`${BASE}/guide.en.html`);
  }
  return { changelog, guideHtml };
}

let GuideApp = null;

/** The window class, built on first use so Foundry's ApplicationV2 is surely loaded. */
export function getGuideApp() {
  if (GuideApp) return GuideApp;
  const { ApplicationV2 } = foundry.applications.api;
  GuideApp = class ThresholdGuide extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "threshold-guide",
      classes: ["threshold-guide"],
      tag: "div",
      window: { title: "THRESHOLD.Guide.Title", icon: "fa-solid fa-dungeon", resizable: true },
      position: { width: 720, height: Math.min(820, Math.round(window.innerHeight * 0.85)) }
    };

    async _prepareContext() {
      const lang = game.i18n.lang === "pl" ? "pl" : "en";
      const content = await loadGuideContent(lang);
      return {
        ...content,
        lang,
        isGM: game.user.isGM,
        version: MODULE_VERSION,
        lastSeen: this.options.lastSeen ?? null,
        showOnUpdate: game.settings.get(MODULE_ID, "showWelcome")
      };
    }

    async _renderHTML(context) {
      const t = key => game.i18n.localize(key);
      return renderGuideHTML({ ...context, t }) + `
        <footer class="thr-guide-footer">
          <label><input type="checkbox" data-thr-show-welcome${context.showOnUpdate ? " checked" : ""}> ${t("THRESHOLD.Guide.ShowOnUpdate")}</label>
          <button type="button" data-thr-close><i class="fa-solid fa-check"></i> ${t("THRESHOLD.Guide.Close")}</button>
        </footer>`;
    }

    _replaceHTML(result, content) {
      // The scrolling happens in an inner element: Foundry's .window-content keeps its
      // own overflow rules, and a scroll container there fights with them.
      content.innerHTML = `<div class="thr-guide">${result}</div>`;
      finishGuideDOM(content.firstElementChild, { isGM: game.user.isGM });
      content.querySelector("[data-thr-close]")?.addEventListener("click", () => this.close());
      content.querySelector("[data-thr-show-welcome]")?.addEventListener("change", event => {
        game.settings.set(MODULE_ID, "showWelcome", event.target.checked);
      });
    }
  };
  return GuideApp;
}

/** Open the guide window. */
export function openGuide(options = {}) {
  const App = getGuideApp();
  return new App(options).render({ force: true });
}

/** On world load: show what's new if this user hasn't seen this version yet. */
export async function maybeShowWelcome() {
  try {
    const lastSeen = game.settings.get(MODULE_ID, "lastSeenVersion") || null;
    const enabled = game.settings.get(MODULE_ID, "showWelcome");
    if (lastSeen !== MODULE_VERSION) await game.settings.set(MODULE_ID, "lastSeenVersion", MODULE_VERSION);
    if (shouldShowWelcome(MODULE_VERSION, lastSeen, enabled)) await openGuide({ lastSeen });
  } catch (err) {
    console.error(`${LOG_PREFIX} Could not open the welcome window.`, err);
  }
}

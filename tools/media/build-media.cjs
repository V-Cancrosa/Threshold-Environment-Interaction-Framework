// Renders the package images in assets/media from cover.html and icon.html.
// Usage (needs Playwright + Chromium): node tools/media/build-media.cjs
const path = require("path");
const { chromium } = require("playwright");
(async () => {
  const dir = __dirname;
  const out = path.join(dir, "..", "..", "assets", "media");
  const browser = await chromium.launch();
  for (const [name, w, h, transparent] of [["cover", 1600, 900, false], ["icon", 512, 512, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto("file://" + path.join(dir, `${name}.html`));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${name}.png`), omitBackground: transparent });
    await page.close();
  }
  await browser.close();
})();

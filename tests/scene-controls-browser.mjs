import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const appPath = process.env.FOUNDRY_APP_PATH ?? "C:/Program Files/Foundry Virtual Tabletop/resources/app";
const native = await readFile(appPath + "/public/css/foundry2.css", "utf8");
const patch = await readFile(new URL("../styles/scene-controls.css", import.meta.url), "utf8");
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE
  ?? process.env.LOCALAPPDATA + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  // v14 renders scene-controls-layers; retain coverage for older controls markup.
  for (const [height, category, layerCount, toolCount, shouldScroll] of [
    [590, "layers", 10, 10, false],
    [360, "layers", 18, 50, true],
    [800, "layers", 18, 50, true],
    [360, "controls", 18, 50, true]
  ]) {
    const page = await browser.newPage({viewport: {width: 1280, height}});
    await page.route("**/*", route => route.abort());
    await page.setContent(`<body class="theme-dark sbs-compact-scene-controls" style="--ui-scale:1.25">
      <section id="ui-left" class="flexrow" style="--control-columns:8">
        <div id="ui-left-column-1" class="flexcol">
          <section id="scene-controls">
            ${[[category, layerCount], ["tools", toolCount]].map(([name, count]) =>
              `<menu id="scene-controls-${name}" class="flexcol">${Array.from({length: count}, (_, i) =>
                `<li><button class="ui-control" aria-label="${name} ${i}">${i}</button></li>`).join("")}</menu>`).join("")}
          </section>
          <button type="button" style="flex:none;height:32px">Nexus</button>
          ${shouldScroll ? '<aside style="flex:none;height:20px">Players</aside>' : ""}
        </div>
      </section>
    </body>`);
    await page.addStyleTag({content: native});
    await page.addStyleTag({content: patch});
    const aligned = await page.evaluate(category => {
      const columns = [category, "tools"].map(name =>
        [...document.querySelectorAll("#scene-controls-" + name + " button")].slice(0, 5)
          .map(button => button.getBoundingClientRect().top));
      return columns[0].every((top, i) => Math.abs(top - columns[1][i]) < .5);
    }, category);
    assert.ok(aligned, "category and tool buttons must align row for row");
    if (shouldScroll) {
      const tools = page.locator("#scene-controls-tools");
      await tools.locator("button").first().hover();
      await page.mouse.wheel(0, 120);
      await page.waitForFunction(() => document.querySelector("#scene-controls-tools").scrollTop > 0);
      assert.equal(await page.locator("#scene-controls-" + category).evaluate(node => node.scrollTop), 0);
    }
    for (const name of [category, "tools"]) {
      const menu = page.locator("#scene-controls-" + name);
      const metrics = await menu.evaluate(node => ({
        scroll: node.scrollHeight > node.clientHeight,
        rowFits: node.clientHeight % 36 === 0,
        scrollbar: getComputedStyle(node).scrollbarWidth,
        wrap: getComputedStyle(node).flexWrap,
        width: node.querySelector("button").offsetWidth,
        sameColumn: [...node.querySelectorAll("button")].every(b => b.offsetLeft === node.querySelector("button").offsetLeft)
      }));
      assert.equal(metrics.scroll, shouldScroll, name + " should only scroll when buttons do not fit");
      assert.ok(metrics.rowFits, "scroll area must fit whole rows");
      assert.equal(metrics.scrollbar, "none");
      assert.equal(metrics.wrap, "nowrap");
      assert.equal(metrics.width, 32);
      assert.ok(metrics.sameColumn);
      const last = menu.locator("button").last();
      await last.scrollIntoViewIfNeeded();
      const inside = await last.evaluate(button => {
        const b = button.getBoundingClientRect(), m = button.closest("menu").getBoundingClientRect();
        return b.left >= m.left && b.right <= m.right && b.top >= m.top && b.bottom <= m.bottom;
      });
      assert.ok(inside, "last button must be fully accessible");
      await last.click();
    }
    const fits = await page.locator("#scene-controls").evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return [...node.children].every(child => child.getBoundingClientRect().right <= bounds.right);
    });
    assert.ok(fits, "both columns fit despite Foundry's calculated column count");
    await page.evaluate(() => document.body.classList.remove("sbs-compact-scene-controls"));
    assert.equal(await page.locator("#scene-controls-tools").evaluate(menu => getComputedStyle(menu).flexWrap), "wrap");
    await page.close();
  }
  console.log("PASS scene controls align in compact columns, fit ten rows at 125% scale, and scroll through longer lists without visible scrollbars");
} finally { await browser.close(); }

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const foundryRoot = process.env.FOUNDRY_APP_PATH ?? "C:/Program Files/Foundry Virtual Tabletop/resources/app";
const sheets = await Promise.all([
  readFile(foundryRoot + "/public/css/foundry2.css", "utf8"),
  readFile(new URL("../../../systems/swade/styles/swade.css", import.meta.url), "utf8"),
  readFile(new URL("../../swade-grid-inventory/styles/inventory.css", import.meta.url), "utf8"),
  readFile(new URL("../../swade-better-subsystems/styles/chase.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/porcelain.css", import.meta.url), "utf8")
]);
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE
  ?? process.env.LOCALAPPDATA + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  for (const porcelainFirst of [false, true]) {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.setContent(`<!doctype html><body class="theme-dark sbs-white-swade sbs-white-subsystems-chase">
      <form class="application swade swade-application sbs-dialog sbs-chase-theme" id="chase">
        <header class="window-header"><h1>Chase</h1></header>
        <section class="window-content"><button>Chase action</button></section>
      </form>
      <form class="application swade swade-application sbs-dialog sbs-subsystem-manager" id="manager">
        <section class="window-content">Subsystem manager</section>
      </form>
      <nav id="context-menu" class="sgi-menu" popover="manual"><ol class="context-items">
        <li class="context-item"><i class="fa-solid fa-book"></i><span>Open item</span></li>
      </ol></nav>
      <article class="chat-message">Chat</article>
      <form class="application sheet swade pathfinder" id="custom"><section class="window-content">Other sheet</section></form>
    </body>`);
    const order = porcelainFirst ? [sheets[4], ...sheets.slice(0, 4)] : sheets;
    for (const content of order) await page.addStyleTag({content});
    await page.locator("#context-menu").evaluate(node => node.showPopover());
    const colors = await page.evaluate(() => {
      const style = selector => {
        const s = getComputedStyle(document.querySelector(selector));
        return {background: s.backgroundColor, color: s.color, paper: s.getPropertyValue("--sbs-paper").trim()};
      };
      return Object.fromEntries(["#chase", "#chase .window-content", "#manager", "#manager .window-content",
        "#context-menu", "#context-menu .context-item", ".chat-message", "#custom"].map(selector => [selector, style(selector)]));
    });
    for (const selector of ["#chase", "#chase .window-content", "#manager", "#manager .window-content"]) {
      assert.equal(colors[selector].background, "rgb(252, 250, 246)", selector);
      assert.equal(colors[selector].color, "rgb(41, 37, 31)", selector);
    }
    assert.equal(colors["#context-menu"].background, "rgb(255, 253, 249)");
    assert.equal(colors["#context-menu .context-item"].color, "rgb(41, 37, 31)");
    assert.equal(colors[".chat-message"].paper, "");
    assert.equal(colors["#custom"].paper, "");
    await page.locator("#context-menu .context-item").hover();
    assert.equal(await page.locator("#context-menu .context-item").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(242, 226, 217)");
    await page.evaluate(() => document.body.classList.remove("sbs-white-swade", "sbs-white-subsystems-chase"));
    assert.notEqual(await page.locator("#context-menu").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 253, 249)");
    await page.close();
  }
  console.log("PASS Porcelain chase dialogs and detached Grid Inventory menus, in both stylesheet orders; dark theme, chat and custom sheets preserved");
} finally { await browser.close(); }

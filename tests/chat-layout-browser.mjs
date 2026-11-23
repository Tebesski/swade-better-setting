import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const main = await readFile(new URL("../scripts/main.mjs", import.meta.url), "utf8");
assert.match(main, /Hooks\.once\("setup", \(\) => \{\s*(?:\/\/[^\n]*\n\s*)*installChatLayout\(\)/);
const source = await readFile(new URL("../scripts/chat-layout.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../styles/chat.css", import.meta.url), "utf8");
const browser = await chromium.launch({headless: true, executablePath: process.env.LOCALAPPDATA
  + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({content: css});
  const errors = [];
  page.on("pageerror", error => (errors.push(error.message), console.error(error.message)));
  await page.evaluate(async source => {
    const hooks = new Map();
    globalThis.Hooks = {on: (name, fn) => hooks.set(name, fn)};
    const item = {type: "power", name: "Launch", img: "", system: {rank: "Novice", range: "10", duration: "Instant", damage: "2d4"}};
    globalThis.game = {scenes: new Map(), actors: new Map(), user: {}, settings: {get: () => false}, modules: new Map([
      ["swade-better-powers", {api: {powerChatDescription: async () => ({description: "<p>Saved power description</p>", modifiers: "<p>Damaging modifier</p>"})}}]
    ])};
    globalThis.foundry = {utils: {fromUuidSync: () => item}};
    const instrumented = source.replace("function layout(message, root) {", "function layout(message, root) { globalThis.layoutRuns = (globalThis.layoutRuns ?? 0) + 1;");
    new Function("sbsI18n", "usesTargetRows", instrumented.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "")
      + ";installChatLayout();")(key => key, () => true);
    const render = hooks.get("renderChatMessageHTML");
    const roots = [];
    // Foundry renders a batch of saved cards before attaching the chat log.
    for (let i = 0; i < 3; i++) {
      const root = document.createElement("article"); root.className = "chat-message";
      root.innerHTML = '<header class="message-header"></header><div class="message-content"><div class="swade-roll-message"><div class="targets">Legacy targets</div><details class="modifiers"><summary>Modifiers</summary><ul class="modifier-list"></ul></details><div class="dice-roll">9</div></div></div>';
      render({id: String(i), rolls: [{}], flags: {"swade-better-powers": {powerCast: {itemUuid: "Item.test"}}}}, root);
      roots.push(root);
    }
    // Other modules finish their own render work while these roots are detached.
    for (const root of roots) {
      root.querySelector(".message-content").insertAdjacentHTML("beforeend", '<header class="card-header"><h3>Launch</h3></header><details class="sbe-chat-roll-flags"><summary>Flags</summary></details><button class="sbp-cast-options-button">Casting Options</button><section class="sbe-target-responses">Target results</section>');
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.body.append(...roots);
    for (const root of roots) {
      if (!root.classList.contains("sbs-power-card")) throw Error("History card layout missing");
      if (root.querySelectorAll(".card-header").length !== 1) throw Error("Duplicate header; layout runs=" + globalThis.layoutRuns + "; visibility=" + document.visibilityState);
      if (!root.querySelector(".card-header + .sbe-chat-roll-flags + .sbs-chat-stats + .sbs-chat-description")) throw Error("History header/flags/description ordering incorrect");
      if (!root.querySelector(".sbs-power-description").textContent.includes("Saved power description")) throw Error("History description missing");
      if (!root.querySelector(".swade-roll-message > .sbp-cast-options-button + details.modifiers:last-child")) throw Error("History roll controls ordering incorrect");
      if (getComputedStyle(root.querySelector(".targets")).display !== "none") throw Error("Legacy targets still visible");
    }
    // Each copy (sidebar/popout) remains independently observed on later updates.
    const first = roots[0], button = first.querySelector(".sbp-cast-options-button");
    const before = globalThis.layoutRuns;
    first.querySelector(".message-content").append(button);
    // Simulate a rapid burst from another module (dice rendering, controls).
    for (let i = 0; i < 100; i++) first.querySelector(".message-content").append(document.createElement("span"));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (button.nextElementSibling?.matches("details.modifiers") !== true) throw Error("First history observer disconnected during batch rendering");
    if (globalThis.layoutRuns !== before + 1) throw Error("Layout was not batched or reacted to its own DOM changes");
    first.querySelector(".message-content").append(document.createElement("span"));
    await Promise.resolve();
    hooks.get("deleteChatMessage")({id: "0"});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (globalThis.layoutRuns !== before + 1) throw Error("Deleted message retained a scheduled layout");
  }, source);
  assert.deepEqual(errors, []);
  console.log("PASS saved chat history: early registration, detached batches, asynchronous enrichment, description, native control ordering, and observer lifetime");
} finally { await browser.close(); }




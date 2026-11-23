import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const source = await readFile(new URL("../scripts/roll-layout.mjs", import.meta.url), "utf8");
const browser = await chromium.launch({headless: true, executablePath: process.env.LOCALAPPDATA
  + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  const page = await browser.newPage();
  await page.setContent('<form class="application swade roll-dialog" style="width:480px"><div class="window-content"><ul class="modifiers">'
    + Array.from({length: 6}, (_, i) => `<li class="modifier-entry">Modifier ${i}</li>`).join("")
    + '</ul><footer class="form-footer"><button type="submit">Roll</button></footer></div></form>');
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(async source => {
    const hooks = new Map();
    globalThis.Hooks = {on: (name, fn) => hooks.set(name, fn)};
    globalThis.game = {user: {targets: new Set(), isGM: true}};
    globalThis.canvas = {ready: true, tokens: {controlled: []}};
    const observations = new Set();
    const NativeResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class extends NativeResizeObserver {
      observe(node) { observations.add(node); super.observe(node); }
      unobserve(node) { observations.delete(node); super.unobserve(node); }
      disconnect() { observations.clear(); super.disconnect(); }
    };
    const instrumented = source.replace("function rollTargets(root) {", "function rollTargets(root) { globalThis.targetBuilds = (globalThis.targetBuilds ?? 0) + 1;");
    new Function("sbsI18n", instrumented.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + ";installRollLayout();")(key => key);
    const root = document.querySelector("form"), app = {rendered: true, element: root, setPosition: () => {}};
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    hooks.get("renderApplicationV2")(app, root);
    await frames();
    const before = globalThis.targetBuilds;
    const target = {visible: true, name: "Target", document: {texture: {src: ""}, hidden: false}};
    game.user.targets.add(target);
    const targetHook = [...hooks].find(([key]) => key.includes("targetToken"))[1];
    for (let i = 0; i < 100; i++) targetHook();
    await frames();
    if (globalThis.targetBuilds !== before + 1) throw Error("Selection burst rebuilt target badges more than once");
    if (!root.querySelector(".sbs-roll-targets").textContent.includes("Target")) throw Error("Latest targets missing");
    const removed = root.querySelector(".modifier-entry");
    removed.remove();
    await frames();
    if (observations.has(removed)) throw Error("Removed modifier row remains observed");
    targetHook();
    app.rendered = false;
    hooks.get("closeApplicationV2")(app);
    await frames();
    if (observations.size || globalThis.targetBuilds !== before + 1) throw Error("Closed dialog retained work or observers");
  }, source);
  assert.deepEqual(errors, []);
  console.log("PASS roll layout: selection bursts batch once, removed rows unobserved, closed dialogs release work");
} finally { await browser.close(); }

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const source = await readFile(new URL("../scripts/npc-tools.mjs", import.meta.url), "utf8");
const browser = await chromium.launch({headless: true, executablePath: process.env.LOCALAPPDATA
  + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async source => {
    globalThis.game = {user: {isGM: true}, settings: {get: () => false}};
    globalThis.CONST = {TOKEN_DISPOSITIONS: {FRIENDLY: 1, HOSTILE: -1, SECRET: -2}};
    let calculations = 0;
    const totals = [];
    const jobs = [];
    const refresh = new Function("actorRating", "sbsI18n", "MIN_CR", "advancementStrength", "encounterThreat", "formatCR",
      "MAX_FORECAST_COMBATANTS", "encounterSnapshot", "requestEncounterForecast", "cancelEncounterForecast", "threatLabel",
      source.slice(source.indexOf("function refreshThreat("), source.indexOf("function npcRankControl(")) + ";return refreshThreat;"
    )(actor => { calculations++; return {cr: actor.cr, strength: actor.cr, rated: true, manual: actor.manual}; }, (key, data) => data?.p0 ?? key, -2, () => 1,
      (enemies, party) => { totals.push([enemies, party]); return {label: "High", threat: .5, partyWin: .5}; }, String,
      32, () => ({}), () => new Promise(resolve => jobs.push(resolve)), () => {}, p => p < .2 ? "Low" : "Extreme");
    const ally = {cr: 4, type: "character", system: {}}, enemy = {cr: 2, type: "npc", system: {}};
    const combatants = [{actor: ally, token: {disposition: 1}}, ...Array.from({length: 20}, () => ({actor: enemy, token: {disposition: -1}}))];
    const app = {viewed: {combatants}}, roots = [document.createElement("section"), document.createElement("section")];
    for (const root of roots) root.innerHTML = '<ol class="combat-tracker"></ol>';
    const ratings = new Map();
    for (const root of roots) refresh(app, root, ratings);
    if (calculations !== 2) throw Error("Duplicate linked actors or popout caused redundant calculations");
    if (JSON.stringify(totals) !== "[[40,4],[40,4]]") throw Error("Combatant multiplicity lost");
    enemy.cr = 3;
    refresh(app, roots[0]);
    if (calculations !== 4 || totals.at(-1)[0] !== 60) throw Error("Actor edits left stale ratings");
    jobs[2]({wins: 0, unresolved: 0, trials: 10});
    jobs[0]({wins: 10, unresolved: 0, trials: 10});
    await Promise.resolve();
    if (roots[0].querySelector("strong").textContent !== "Extreme") throw Error("Stale forecast overrode the latest roster");
    jobs[1]({wins: 0, unresolved: 10, trials: 10});
    await Promise.resolve();
    if (roots[1].querySelector(".sbs-threat-pointer")) throw Error("Unresolved fights incorrectly showed a point estimate");
    enemy.manual = true;
    refresh(app, roots[0]);
    if (jobs.length !== 3 || !roots[0].textContent.includes("High")) throw Error("Manual CR ignored");
    return true;
  }, source);
  assert.equal(result, true);
  console.log("PASS encounter refresh: linked actors rated once, combatant counts preserved, edits recalculate");
} finally { await browser.close(); }

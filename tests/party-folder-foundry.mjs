import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser = await chromium.launch({headless: true, executablePath: process.env.LOCALAPPDATA
  + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe"});
try {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  await page.goto("http://localhost:30042");
  await page.locator("select[name=userId]").selectOption({label: "Gamemaster"});
  await page.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await page.waitForFunction(() => globalThis.game?.ready, null, {timeout: 60000});
  assert.equal(await page.evaluate(() => game.world.id), "maneuver-qa");
  // Headless Chromium's hardware-acceleration warning can cover the sidebar.
  await page.evaluate(() => document.querySelectorAll("#notifications .notification[data-id]")
    .forEach(node => ui.notifications.remove(Number(node.dataset.id))));
  await page.evaluate(() => {ui.sidebar.changeTab("actors", "primary"); ui.sidebar.expand();});
  const ids = await page.evaluate(async () => {
    const actor = await Actor.create({name: "Party folder fixture member", type: "character"});
    const party = await Actor.create({name: "Party folder fixture", type: "group", system: {members: [actor.uuid]}});
    return {party: party.id, actor: actor.id};
  });
  try {
    await page.waitForFunction(({party, actor}) => game.actors.get(party)?.getFlag("swade-better-setting", "partyFolder")
      === game.actors.get(actor)?.folder?.id, ids);
    const folder = await page.evaluate(id => game.actors.get(id).getFlag("swade-better-setting", "partyFolder"), ids.party);
    const row = page.locator(`[data-folder-id="${folder}"]`).first();
    await row.locator(".sbs-open-party-sheet").waitFor();
    assert.ok(await row.evaluate(node => node.parentElement.firstElementChild === node));
    assert.ok(await row.evaluate(node => node.querySelector(".folder-header").firstElementChild
      .classList.contains("sbs-open-party-sheet")), "sheet button replaces the folder icon on the left");
    assert.equal(await row.locator(":scope > .folder-header > i.fa-folder-open").count(), 0);
    const expanded = await row.evaluate(node => node.classList.contains("expanded"));
    await row.locator(".sbs-open-party-sheet").click();
    assert.equal(await row.evaluate(node => node.classList.contains("expanded")), expanded,
      "opening the sheet must not toggle the folder");
    await page.locator(".sbs-party-sheet").waitFor();
    assert.ok((await page.locator(".sbs-party-sheet").innerText()).includes("Party folder fixture member"));
    await page.evaluate(id => game.actors.get(id).update({folder: null}), ids.actor);
    await page.waitForFunction(id => game.actors.get(id).system.members.size === 0, ids.party);
    await page.evaluate(({actor, folder}) => game.actors.get(actor).update({folder}), {actor: ids.actor, folder});
    await page.waitForFunction(({actor, party}) => game.actors.get(party)._source.system.members.includes("Actor." + actor), ids);
    await page.evaluate(id => game.actors.get(id).update({name: "Renamed party folder fixture"}), ids.party);
    await page.waitForFunction(id => game.folders.get(id)?.name === "Renamed party folder fixture", folder);
    assert.equal(await page.locator(`.entry[data-entry-id="${ids.party}"]`).count(), 0);
    console.log("PASS group creates pinned folder, migrates members, opens sheet, follows native folder membership and renames");
  } finally {
    await page.evaluate(async ({party, actor}) => {
      const group = game.actors.get(party);
      const folder = group?.getFlag("swade-better-setting", "partyFolder");
      if (group) {await group.sheet.close(); await group.delete();}
      await game.actors.get(actor)?.delete();
      if (folder) await game.folders.get(folder)?.delete();
    }, ids);
  }
} finally {await browser.close();}

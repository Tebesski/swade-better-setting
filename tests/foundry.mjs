// Run against a disposable v14 world named better-setting-qa, never a campaign world.
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";

const url = process.env.FOUNDRY_QA_URL ?? "http://localhost:30001";
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  args: ["--enable-unsafe-swiftshader"]});
const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
let page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", msg => { if (msg.type() === "error" && msg.text().includes("swade-better-setting")) errors.push(msg.text()); });
const moduleId = "swade-better-setting";
const packId = "world.better-setting-skills";
const prefix = `Skills QA ${Date.now()}`;
await mkdir("test-results", {recursive: true});
const pass = message => console.log(`PASS ${message}`);
async function ready(target = page) {
  await target.waitForFunction(() => globalThis.game?.ready, null, {timeout: 45000});
  assert.equal(await target.evaluate(() => game.world.id), "better-setting-qa", "Refusing to modify a campaign world");
  await target.addStyleTag({content: "#notifications {pointer-events: none !important}"});
}
async function closeApps() {
  await page.evaluate(async () => {
    for (const app of foundry.applications.instances.values()) if (app.hasFrame && app.rendered) await app.close();
  });
}
try {
  await page.goto(url);
  await page.locator('select[name="userId"]').selectOption({label: "Gamemaster"});
  await page.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await ready();
  if (!await page.evaluate(id => game.modules.get(id)?.active, moduleId)) {
    await page.evaluate(async id => game.settings.set("core", "moduleConfiguration", {
      ...game.settings.get("core", "moduleConfiguration"), [id]: true, "swade-better-effects": true
    }), moduleId);
    await page.reload();
    await ready();
  }
  await page.waitForFunction(id => game.settings.get(id, "libraryInitialized"), moduleId);
  await page.evaluate(async ({moduleId, packId}) => {
    await game.user.setFlag(moduleId, "skillFavorites", []);
    await game.user.setFlag(moduleId, "traitFavorites", []);
    for (const item of await game.packs.get(packId).getDocuments()) if (item.name.startsWith("Skills QA ")) await item.delete();
    for (const actor of game.actors.filter(actor => actor.name.startsWith("Skills QA "))) await actor.delete();
  }, {moduleId, packId});
  await page.evaluate(async ({moduleId, packId, prefix}) => {
    globalThis.qa = {api: game.modules.get(moduleId).api, pack: game.packs.get(packId), prefix};
    qa.skills = await qa.pack.getDocuments();
  }, {moduleId, packId, prefix});
  const catalog = await page.evaluate(() => qa.skills.map(item => ({name: item.name, core: item.system.isCoreSkill, attribute: item.system.attribute})));
  assert.ok(catalog.length >= 32);
  assert.equal(catalog.filter(item => item.core).length, 5);
  pass("world compendium initializes with all standard skills and five core skills");

  await page.evaluate(async () => {
    qa.pc = await Actor.create({name: `${qa.prefix} PC`, type: "character"});
    qa.npc = await Actor.create({name: `${qa.prefix} NPC`, type: "npc"});
  });
  assert.deepEqual(await page.evaluate(() => [qa.pc, qa.npc].map(actor => actor.itemTypes.skill.filter(item => item.system.isCoreSkill).map(item => item.name).sort())),
    [0, 1].map(() => ["Athletics", "Common Knowledge", "Notice", "Persuasion", "Stealth"].sort()));
  pass("PCs and NPCs receive catalog core skills");

  await page.evaluate(async () => {
    await qa.pc.sheet.render({force: true});
    qa.before = qa.pc.items.size;
  });
  await page.locator('[data-action="createDocument"][data-type="skill"]').click();
  await page.locator(".sbs-picker").waitFor();
  assert.equal(await page.evaluate(() => qa.pc.items.size === qa.before), true);
  const search = page.locator('.sbs-picker input[type="search"]');
  await search.fill("Shooting");
  assert.equal(await page.locator(".sbs-row:visible").count(), 1);
  await page.locator('.sbs-row:visible .sbs-star').click();
  await search.fill("");
  assert.ok(await page.locator(".sbs-row:visible").count() >= 32, "Clearing a search after starring restores all entries");
  assert.equal(await page.locator(".sbs-group").first().locator("h3").innerText(), "Starred");
  await page.locator('.sbs-group').first().getByRole("button", {name: "Shooting", exact: true}).click();
  await page.waitForFunction(() => qa.pc.items.some(item => item.name === "Shooting"));
  pass("actor add opens picker without creating an item; search, star, and catalog add work");

  await page.locator('[data-action="createDocument"][data-type="skill"]').click();
  await page.locator('[data-action="createSkill"]').click();
  await page.locator(".sbs-skill-draft").waitFor();
  await page.locator('.sbs-skill-draft [name="name"]').fill(`${prefix} Cancelled`);
  await page.locator('.sbs-skill-draft [data-action="close"]').click();
  assert.equal(await page.evaluate(() => qa.pc.items.some(item => item.name.endsWith("Cancelled"))), false);
  pass("closing a standard skill draft discards it");

  await page.locator('[data-action="createDocument"][data-type="skill"]').click();
  await page.locator('[data-action="createSkill"]').click();
  const draft = page.locator(".sbs-skill-draft");
  await draft.locator('[name="name"]').fill(`${prefix} Navigation`);
  await draft.locator('[name="system.attribute"]').selectOption("smarts");
  await draft.locator('[name="system.die.sides"]').selectOption("8");
  await draft.locator('[name="system.isCoreSkill"]').check();
  await draft.locator('.editor-container').hover();
  await draft.locator('prose-mirror button.toggle').click();
  await draft.locator('prose-mirror [contenteditable="true"]').fill("A custom navigation skill description.");
  assert.equal(await draft.locator('.sbs-save-to-library input').isChecked(), true);
  assert.equal(await page.evaluate(() => qa.pc.items.some(item => item.name.endsWith("Navigation"))), false);
  await draft.screenshot({path: "test-results/skill-draft.png"});
  await draft.locator('.sbs-add-skill').click();
  await page.waitForFunction(() => qa.pc.items.some(item => item.name.endsWith("Navigation")));
  await page.waitForFunction(() => [...qa.pack.index].some(item => item.name.endsWith("Navigation")));
  const custom = await page.evaluate(async () => {
    qa.custom = (await qa.pack.getDocuments()).find(item => item.name.endsWith("Navigation"));
    qa.newNPC = await Actor.create({name: `${qa.prefix} Custom Core NPC`, type: "npc"});
    return {die: qa.custom.system.die.sides, description: qa.custom.system.description, onActor: qa.newNPC.items.some(item => item.name === qa.custom.name)};
  });
  assert.deepEqual(custom, {die: 8, description: "<p>A custom navigation skill description.</p>", onActor: true});
  pass("explicit Add skill preserves fields, adds the compendium copy, and custom core skills reach new NPCs");

  await closeApps();
  await page.evaluate(async () => {
    await qa.pack.apps[0].render({force: true});
  });
  await page.locator('.sbs-pack-create').click();
  await page.locator('.sbs-skill-draft [name="name"]').fill(`${prefix} Compendium Draft`);
  assert.equal(await page.locator('.sbs-skill-draft .sbs-save-to-library').count(), 0);
  assert.equal(await page.evaluate(() => qa.pack.index.some(item => item.name.endsWith("Compendium Draft"))), false);
  await page.locator('.sbs-skill-draft .sbs-add-skill').click();
  await page.waitForFunction(() => qa.pack.index.some(item => item.name.endsWith("Compendium Draft")));
  await page.evaluate(async () => (await qa.pack.getDocuments()).find(item => item.name.endsWith("Compendium Draft")).delete());
  pass("native compendium Create Item uses the standard deferred skill sheet");

  await closeApps();
  await page.evaluate(async () => {
    qa.gear = await Item.create({name: `${qa.prefix} Gear`, type: "gear", system: {actions: {additional: {test: {name: "Test action", type: "trait", override: ""}}}}});
    await qa.gear.sheet.render({force: true});
    qa.gear.sheet.changeTab("properties", "main");
  });
  const trait = page.locator('[name="system.actions.trait"]');
  await trait.locator("..").locator(".sbs-trait-picker").click();
  assert.equal(await page.locator('.sbs-group').first().locator('h3').innerText(), "Attributes");
  await page.getByRole("button", {name: "Agility", exact: true}).click();
  await page.waitForFunction(() => qa.gear.system.actions.trait === "agility");
  await trait.locator("..").locator(".sbs-trait-picker").click();
  await page.locator('.sbs-picker input[type="search"]').fill("Fighting");
  await page.locator('.sbs-row:visible .sbs-star').click();
  await page.getByRole("button", {name: "Fighting", exact: true}).click();
  await page.waitForFunction(() => qa.gear.system.actions.trait === "Fighting");
  await page.evaluate(() => qa.gear.sheet.changeTab("actions", "main"));
  await page.locator('details.action summary').click();
  const override = page.locator('[name="system.actions.additional.test.override"]');
  await override.locator("..").locator(".sbs-trait-picker").click();
  assert.equal(await page.locator('.sbs-group').first().locator('h3').innerText(), "Starred");
  await page.getByRole("button", {name: "Fighting", exact: true}).click();
  await page.waitForFunction(() => qa.gear.system.actions.additional.test.override === "Fighting");
  const favorites = await page.evaluate(id => ({skill: game.user.getFlag(id, "skillFavorites"), trait: game.user.getFlag(id, "traitFavorites")}), moduleId);
  assert.equal(favorites.skill.length, 1);
  assert.equal(favorites.trait.length, 1);
  assert.notEqual(favorites.skill[0], favorites.trait[0]);
  pass("Properties and Actions trait pickers store correct values and share their own favorites");

  await closeApps();
  await page.evaluate(() => game.modules.get("swade-better-effects").api.openAegis(qa.gear));
  await page.locator('.sbe-aegis details[data-category="skill"] summary').click();
  await page.locator('.sbe-aegis .sbs-trait-picker').click();
  await page.locator('.sbs-picker input[type="search"]').fill("Shooting");
  await page.getByRole("button", {name: "Shooting", exact: true}).click();
  assert.equal(await page.locator('.sbe-aegis [name="currSkill"]').inputValue(), "Shooting");
  await page.locator('.sbe-aegis').screenshot({path: "test-results/aegis-picker.png"});
  pass("Better Effects A.E.G.I.S. accepts a catalog skill");

  await closeApps();
  await page.evaluate(async () => {
    await qa.custom.delete();
    qa.afterDelete = await Actor.create({name: `${qa.prefix} Deleted Core NPC`, type: "npc"});
  });
  assert.equal(await page.evaluate(() => qa.afterDelete.items.some(item => item.name.endsWith("Navigation"))), false);
  await page.evaluate(async () => {
    const player = game.users.getName("Skills QA Player") ?? await User.create({name: "Skills QA Player", role: 1});
    await qa.pc.update({[`ownership.${player.id}`]: 3});
  });
  const playerContext = await browser.newContext({viewport: {width: 1440, height: 1100}});
  const playerPage = await playerContext.newPage();
  await playerPage.goto(url);
  await playerPage.locator('select[name="userId"]').selectOption({label: "Skills QA Player"});
  await playerPage.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await ready(playerPage);
  await playerPage.evaluate(async ({moduleId, prefix}) => {
    globalThis.playerQA = {actor: game.actors.getName(`${prefix} PC`), api: game.modules.get(moduleId).api};
    await playerQA.api.createSkill({actor: playerQA.actor});
  }, {moduleId, prefix});
  await playerPage.locator('.sbs-skill-draft [name="name"]').fill(`${prefix} Player Skill`);
  await playerPage.locator('.sbs-skill-draft .sbs-add-skill').click();
  await page.waitForFunction(() => qa.pack.index.some(item => item.name.endsWith("Player Skill")));
  pass("a player-created skill is copied by the active GM");
  await page.close();
  await playerPage.waitForFunction(() => !game.users.activeGM);
  await playerPage.evaluate(() => playerQA.api.createSkill({actor: playerQA.actor}).then(() => {}));
  await playerPage.locator('.sbs-skill-draft [name="name"]').fill(`${prefix} Queued Skill`);
  await playerPage.locator('.sbs-skill-draft .sbs-add-skill').click();
  await playerPage.waitForFunction(() => playerQA.actor.items.some(item => item.name.endsWith("Queued Skill")));
  assert.equal(await playerPage.evaluate(id => playerQA.actor.items.find(item => item.name.endsWith("Queued Skill")).getFlag(id, "pendingLibrary"), moduleId), true);
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator('select[name="userId"]').selectOption({label: "Gamemaster"});
  await page.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await ready();
  await page.waitForFunction(packId => game.packs.get(packId).index.some(item => item.name.endsWith("Queued Skill")), packId);
  await playerContext.close();
  pass("player skills queue while the GM is offline and save when the GM rejoins");

  await page.reload(); await ready();
  assert.equal(await page.evaluate(async packId => (await game.packs.get(packId).getDocuments()).some(item => item.name.endsWith("Navigation")), packId), false);
  pass("deleted skills stay deleted across reloads");

  const emptyCores = await page.evaluate(async ({packId, prefix}) => {
    const pack = game.packs.get(packId);
    const cores = (await pack.getDocuments()).filter(item => item.system.isCoreSkill);
    try {
      await Item.updateDocuments(cores.map(item => ({_id: item.id, "system.isCoreSkill": false})), {pack: packId});
      const pc = await Actor.create({name: `${prefix} No Cores PC`, type: "character"});
      const npc = await Actor.create({name: `${prefix} No Cores NPC`, type: "npc"});
      return [pc, npc].map(actor => actor.itemTypes.skill.filter(item => item.system.isCoreSkill).length);
    } finally {
      await Item.updateDocuments(cores.map(item => ({_id: item.id, "system.isCoreSkill": true})), {pack: packId});
    }
  }, {packId, prefix});
  assert.deepEqual(emptyCores, [0, 0]);
  pass("an empty core list does not restore the system's default PC skills");

  await page.evaluate(() => game.settings.set("core", "moduleConfiguration", {...game.settings.get("core", "moduleConfiguration"), "swade-better-effects": false}));
  await page.reload(); await ready();
  await page.evaluate(async prefix => {
    const item = await Item.create({name: `${prefix} Native AEGIS`, type: "gear"});
    globalThis.nativeWizard = new game.swade.apps.ActiveEffectWizard({document: item});
    await nativeWizard.render({force: true});
  }, prefix);
  await page.locator('.active-effect-wizard .sbs-trait-picker').click();
  await page.locator('.sbs-picker input[type="search"]').fill("Healing");
  await page.getByRole("button", {name: "Healing", exact: true}).click();
  await page.waitForFunction(() => nativeWizard.currSkill === "Healing");
  pass("native SWADE A.E.G.I.S. works without Better Effects");
  await page.evaluate(() => game.settings.set("core", "moduleConfiguration", {...game.settings.get("core", "moduleConfiguration"), "swade-better-effects": true}));
  assert.deepEqual(errors, [], "No module browser errors");
} catch (error) {
  await mkdir("test-results", {recursive: true});
  await page.screenshot({path: "test-results/failure.png"}).catch(() => {});
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}

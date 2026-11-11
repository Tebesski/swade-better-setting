// Run only against the disposable better-setting-qa world.
import assert from "node:assert/strict";
import {chromium} from "playwright";

const url = process.env.FOUNDRY_QA_URL ?? "http://localhost:30002";
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  args: ["--enable-unsafe-swiftshader"]});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", error => errors.push(error.stack ?? error.message));
const name = `Global QA ${Date.now()}`;
const setting = "swade-better-setting", powers = "swade-better-powers", templates = "swade-better-templates";

const hub = page.getByRole("button", {name: "Better SWADE Compendium", exact: true});
const library = page.locator(".sbs-modifier-library");
const builder = page.locator(".sbt-builder");
const editor = page.locator(".sbs-modifiers-tab");
const waitReady = async target => {
  await target.waitForFunction(() => globalThis.game?.ready);
  assert.equal(await target.evaluate(() => game.world.id), "better-setting-qa");
};

try {
  await page.goto(url);
  await page.locator('select[name="userId"]').selectOption({label: "Gamemaster"});
  await page.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await waitReady(page);
  const mods = [setting, powers, templates, "swade-hud"];
  if (!await page.evaluate(ids => ids.every(id => game.modules.get(id)?.active), mods)) {
    await page.evaluate(ids => game.settings.set("core", "moduleConfiguration", {
      ...game.settings.get("core", "moduleConfiguration"), ...Object.fromEntries(ids.map(id => [id, true]))
    }), mods);
    await page.reload();
    await waitReady(page);
  }
  await page.addStyleTag({content: "#notifications {pointer-events:none!important}"});
  await page.evaluate(() => {ui.sidebar.changeTab("compendium", "primary"); ui.sidebar.expand();});
  await hub.click();
  const skills = page.getByRole("button", {name: "Skills", exact: true});
  await skills.waitFor();
  assert.equal(await skills.evaluate(button => button === document.activeElement), false);
  assert.equal(await page.locator(".sbt-open-library").count(), 0);
  await skills.click();
  await page.locator(".sbs-picker .sbs-choice").first().waitFor();
  await page.locator('.sbs-picker [data-action="close"]').click();
  await hub.click();
  await page.getByRole("button", {name: "Templates", exact: true}).click();
  const templatesLibrary = page.locator(".sbt-library");
  await templatesLibrary.waitFor();
  const newTemplate = templatesLibrary.getByRole("button", {name: "New template", exact: true});
  for (const number of [0, 1]) {
    await newTemplate.click();
    await page.locator('dialog input[name="name"]').fill(name);
    await page.getByRole("button", {name: "Create", exact: true}).click();
    if (number) await page.getByRole("button", {name: "Save Copy", exact: true}).click();
    await builder.waitFor();
    await builder.locator('[data-action="close"]').click();
    await templatesLibrary.getByText(number ? `${name} (1)` : name, {exact: true}).waitFor();
  }
  const templateRow = templatesLibrary.locator(`li[data-name="${name} (1)"]`);
  await templateRow.getByRole("button", {name: "Change template icon"}).click();
  await page.waitForFunction(() => [...foundry.applications.instances.values()].some(app => app instanceof CONFIG.ux.FilePicker && app.rendered));
  await page.evaluate(async () => {
    const picker = [...foundry.applications.instances.values()].find(app => app instanceof CONFIG.ux.FilePicker);
    picker.callback("icons/svg/fire.svg");
    await picker.close();
  });
  await page.waitForFunction(name => document.querySelector(`.sbt-library li[data-name="${name} (1)"] img`)?.getAttribute("src") === "icons/svg/fire.svg", name);
  await templateRow.getByRole("button", {name: "Remove template"}).click();
  await page.getByRole("button", {name: "Yes", exact: true}).click();
  await templateRow.waitFor({state: "detached"});
  await templatesLibrary.locator('[data-action="close"]').click();
  await hub.click();
  await page.getByRole("button", {name: "Modifiers", exact: true}).click();
  await library.waitFor();
  console.log("PASS sidebar hub opens the Skills, Templates, and Modifiers libraries");

  const individual = library.locator("[data-group-name=Individual]");
  const global = library.locator("[data-group-name=Global]");
  const createModifier = async (group, modifierName) => {
    await group.getByRole("button", {name: "Create Modifier", exact: true}).click();
    await page.locator('dialog input[name="name"]').fill(modifierName);
    await page.getByRole("button", {name: "Create", exact: true}).click();
    const entry = group.locator(`details[data-name="${modifierName}"]`);
    await entry.waitFor();
    return entry;
  };
  assert.equal(await individual.evaluate(group => group.open), true);
  assert.equal(await global.evaluate(group => group.open), false);
  const personal = await createModifier(individual, `${name} Individual`);
  assert.equal(await personal.getByRole("checkbox", {name: "Global", exact: true}).count(), 0);
  assert.equal(await personal.getByRole("button", {name: "Delete option"}).count(), 0);
  assert.equal(await personal.getByRole("textbox", {name: "Power Point cost"}).getAttribute("data-placeholder"), "N");
  await personal.getByRole("button", {name: "Add Modifier Option"}).click();
  await personal.getByRole("button", {name: "Delete option"}).last().click();
  await personal.getByRole("button", {name: "Delete option"}).first().waitFor({state: "detached"});

  await global.locator(":scope > summary").click();
  const entry = await createModifier(global, name);
  const catalog = await page.evaluate(name => {
    globalThis.hubQA = {name};
    return game.settings.get("swade-better-setting", "modifierCompendium").entries.find(row => row.name === name);
  }, name);
  assert.equal(catalog.global, true);
  assert.equal(await entry.getByRole("button", {name: "Save", exact: true}).count(), 0);
  const cost = entry.getByRole("textbox", {name: "Power Point cost"});
  await cost.fill("+2");
  await cost.press("Enter");
  await page.waitForFunction(id => game.settings.get("swade-better-setting", "modifierCompendium").entries.find(row => row.id === id).powers.options[0].cost === 2, catalog.id);
  const richText = entry.locator("prose-mirror");
  await richText.hover();
  await richText.locator("button.toggle").click();
  const surface = richText.locator(".ProseMirror");
  await surface.waitFor();
  assert.ok((await surface.boundingBox()).height >= 100);
  await surface.fill("Saved automatically in the editor.");
  await page.waitForFunction(id => game.settings.get("swade-better-setting", "modifierCompendium").entries.find(row => row.id === id)
    .powers.description.includes("Saved automatically"), catalog.id);
  await entry.getByRole("button", {name: "Add Power Modifier", exact: true}).click();
  await page.locator('dialog select[name="behavior"]').selectOption("adjustDuration");
  await page.getByRole("button", {name: "Add", exact: true}).click();
  const amount = entry.locator('.sbp-power-behavior [data-field="amount"]');
  await amount.fill("3");
  await amount.press("Tab");
  await entry.getByRole("button", {name: "Add Template Modifier", exact: true}).click();
  await page.locator('dialog select[name="behavior"]').selectOption("changeTemplate");
  await page.getByRole("button", {name: "Add", exact: true}).click();
  await entry.locator('[data-path$=".replacements.medium"]').selectOption("large");
  await page.waitForFunction(id => {
    const modifier = game.settings.get("swade-better-setting", "modifierCompendium").entries.find(row => row.id === id);
    return modifier.powers.options[0].changes.some(change => change.type === "adjustDuration" && change.system.amount === 3)
      && modifier.templates.options[0].changes.some(change => change.type === "changeTemplate" && change.system.replacements.medium === "large");
  }, catalog.id);
  console.log("PASS group-specific creation, last-option protection, roomy rich text, and autosaving both inline behavior editors");

  const fixture = await page.evaluate(async ({powers, templates, id}) => {
    const actor = await Actor.create({name: hubQA.name, type: "character"});
    const skill = await Item.create({name: "Spellcasting", type: "skill"}, {parent: actor});
    const [first, second] = await actor.createEmbeddedDocuments("Item", ["Ward", "Bolt"].map(name => ({name, type: "power",
      system: {pp: 1, actions: {trait: skill.name}, templates: {medium: true}, description: `<p>${name} description.</p>`}})));
    const powerAPI = game.modules.get(powers).api, templateAPI = game.modules.get(templates).api;
    Object.assign(hubQA, {actor, skill, first, second, powerAPI, templateAPI, id});
    const available = [first, second].map(item => ({choices: powerAPI.getModifiers(item).filter(row => row.id === id).map(row => [row.id, row.options[0].cost]),
      description: item.system.description, local: item.getFlag(powers, "powerModifiers") ?? null}));
    return {available, template: templateAPI.readCastAutomation(first).modifiers.find(row => row.id === id)?.options[0].changes.find(change => change.type === "changeTemplate")?.system.replacements.medium};
  }, {powers, templates, id: catalog.id});
  assert.deepEqual(fixture.available, ["Ward", "Bolt"].map(name => ({choices: [[catalog.id, 2]], description: `<p>${name} description.</p>`, local: null})));
  assert.equal(fixture.template, "large");
  await page.evaluate(async () => {
    const {withPowerCastCard} = await import("/modules/swade-hud/scripts/power-chat.js");
    const {actor, skill, first} = hubQA;
    const mods = [];
    hubQA.cast = withPowerCastCard(first, mods, () => actor.rollSkill(skill.id, {item: first, additionalMods: mods}));
  });
  await page.locator(".sbs-power-presets .toggle-list").click();
  const widths = await page.locator(".sbs-power-presets").evaluate(preset => [...preset.children].map(el => el.getBoundingClientRect().width));
  assert.ok(Math.abs(widths[0] - widths[1]) < 1, `Modifier chooser widths ${widths}`);
  const choice = page.getByRole("button", {name: `${name} (+2)`, exact: true});
  await choice.focus();
  const inset = await choice.evaluate(button => {
    const viewport = button.closest(".selections").getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return Math.min(viewport.bottom - box.bottom, box.top - viewport.top);
  });
  assert.ok(inset >= 2, `Casting option focus clearance ${inset}px`);
  await choice.click();
  await page.waitForFunction(() => [...foundry.applications.instances.values()].some(app => app.sbsCastingTotal === 3));
  await page.locator('.roll-dialog button[type="submit"]').first().click();
  await page.waitForFunction(() => game.messages.some(message => message.getFlag("swade-hud", "powerCast")?.itemUuid === hubQA.first.uuid));
  const cast = await page.evaluate(async () => {
    const message = game.messages.contents.findLast(message => message.getFlag("swade-hud", "powerCast")?.itemUuid === hubQA.first.uuid);
    const context = message.getFlag("swade-hud", "powerCast");
    const {castDefaults, resolveCastOptions} = await import("/modules/swade-better-templates/scripts/variants.mjs");
    const automation = hubQA.templateAPI.readCastAutomation(hubQA.first);
    const choices = castDefaults(automation, context);
    const resolved = resolveCastOptions(automation, {...choices, baseShape: "medium"}, {item: hubQA.first});
    return {selection: context.modifiers, shape: resolved.shapeKey, expiration: resolved.automation.expiration.enabled};
  });
  assert.ok(cast.selection.includes(catalog.id));
  assert.equal(cast.shape, "large");
  assert.equal(cast.expiration, false);
  console.log("PASS global modifiers reach unconfigured powers without changing descriptions, costs, or template settings until selected");

  await entry.getByRole("button", {name: "Remove modifier", exact: true}).click();
  await page.getByRole("button", {name: "No", exact: true}).click();
  assert.equal(await entry.count(), 1);
  await entry.getByRole("button", {name: "Remove modifier", exact: true}).click();
  await page.getByRole("button", {name: "Yes", exact: true}).click();
  await page.waitForFunction(() => !hubQA.powerAPI.getModifiers(hubQA.first).some(row => row.id === hubQA.id));
  assert.equal(await page.evaluate(() => hubQA.templateAPI.readCastAutomation(hubQA.first).modifiers.some(row => row.id === hubQA.id)), false);
  await page.evaluate(async () => {
    const {savePowerModifiers} = await import("/modules/swade-better-powers/scripts/power-modifiers.mjs");
    const local = {id: foundry.utils.randomID(), name: `${hubQA.name} Local`, description: "<p>Saved from a power.</p>", options: [{id: "base", label: "", cost: -1}]};
    await savePowerModifiers(hubQA.second, [local]);
    await hubQA.powerAPI.openModifierEditor(hubQA.second, local.id);
  });
  await page.evaluate(() => {
    const library = [...foundry.applications.instances.values()].find(app => app.element?.matches(".sbs-modifier-library"));
    library.setPosition({left: 20, top: 100});
    hubQA.second.sheet.setPosition({left: 600, top: 100});
  });
  await editor.locator('[data-modifier-drag]').dragTo(library.locator("[data-group-name=Individual] > summary"));
  await library.getByText(`${name} Local`, {exact: true}).waitFor();
  assert.equal(await page.evaluate(() => hubQA.powerAPI.getModifiers(hubQA.first).some(row => row.name === `${hubQA.name} Local`)), false);
  const itemSheet = page.locator(".swade-item-sheet");
  await itemSheet.locator('[data-tab="description"]').first().click();
  const description = itemSheet.locator('prose-mirror[name="system.description"]');
  await itemSheet.locator(".sbs-power-modifier-summary").waitFor();
  assert.equal(await description.locator(".sbs-power-modifier-summary").count(), 0);
  assert.equal(await description.evaluate(editor => editor.value.includes("sbs-power-modifier-summary")), false);
  const alignment = await itemSheet.evaluate(root => {
    const stats = root.querySelector(".sheet-sidebar .additional-stats-header");
    const modifiers = root.querySelector(".sbs-power-modifier-summary h3");
    const style = element => [getComputedStyle(element).fontFamily, getComputedStyle(element).fontSize, getComputedStyle(element).fontWeight];
    return {delta: stats.previousElementSibling.getBoundingClientRect().top - modifiers.previousElementSibling.getBoundingClientRect().top,
      stats: style(stats), modifiers: style(modifiers)};
  });
  assert.ok(Math.abs(alignment.delta) <= 2, `Divider alignment delta ${alignment.delta}px`);
  assert.deepEqual(alignment.modifiers, alignment.stats);
  const libraryRow = library.locator("details[data-modifier-id]").filter({hasText: `${name} Local`});
  await libraryRow.locator("summary").dragTo(itemSheet.locator('[name="name"]'));
  await page.getByRole("button", {name: "Save Copy", exact: true}).click();
  await page.waitForFunction(() => hubQA.powerAPI.getModifiers(hubQA.second).some(row => row.name === `${hubQA.name} Local (1)`));
  await itemSheet.locator('[data-tab="modifiers"]').first().click();
  assert.equal(await itemSheet.getByText("Global Modifiers", {exact: true}).count(), 0);
  const deletable = editor.locator(".sbs-modifier").filter({has: page.locator(`[data-field="name"][value="${name} Local (1)"]`)});
  await deletable.getByRole("button", {name: "Delete modifier"}).click();
  await page.getByRole("button", {name: "No", exact: true}).click();
  assert.equal(await deletable.count(), 1);
  await deletable.getByRole("button", {name: "Delete modifier"}).click();
  await page.getByRole("button", {name: "Yes", exact: true}).click();
  await deletable.waitFor({state: "detached"});
  await itemSheet.getByRole("button", {name: "Choose an individual modifier"}).click();
  const picker = page.locator(".sbs-modifier-library").last();
  await picker.getByRole("searchbox").fill(name);
  assert.equal(await picker.locator("[data-group-name=Global]").count(), 0);
  await picker.locator('[data-action="close"]').click();
  await page.evaluate(async () => {
    const {savePowerModifiers} = await import("/modules/swade-better-powers/scripts/power-modifiers.mjs");
    const modifiers = Array.from({length: 24}, (_, index) => ({id: foundry.utils.randomID(),
      name: `Scroll test modifier ${index + 1}`, description: "<p>Rules text.</p>", options: [{id: "base", label: "", cost: 0}]}));
    await savePowerModifiers(hubQA.second, modifiers);
  });
  await itemSheet.locator('nav [data-tab="description"]').click();
  const summaryList = itemSheet.locator(".sbs-power-modifier-summary > ul");
  assert.equal(await summaryList.evaluate(list => {
    list.scrollTop = list.scrollHeight;
    return list.scrollTop > 0;
  }), true);
  assert.deepEqual(errors, []);
  console.log("PASS confirmed deletion, modifier sharing, aligned sheet headings, and individual picker");
} catch (error) {
  console.error(await page.evaluate(() => ({notifications: document.querySelector("#notifications")?.textContent,
    windows: [...foundry.applications.instances.values()].filter(app => app.hasFrame && app.rendered).map(app => app.title)})).catch(() => null));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}

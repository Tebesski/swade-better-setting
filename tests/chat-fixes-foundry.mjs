// Uses the disposable maneuver-qa clone on port 30042.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
const blind = JSON.parse(await readFile(new URL("./fixtures/blind-earth.json", import.meta.url), "utf8"));
const browser = await chromium.launch({headless: true, executablePath: process.env.LOCALAPPDATA
  + "/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe", args: ["--enable-unsafe-swiftshader"]});
try {
  const page = await browser.newPage({viewport: {width: 1500, height: 1080}});
  const errors = [];
  page.on("pageerror", error => {errors.push(error.message); console.log("PAGE ERROR", error.stack);});
  page.on("console", msg => {if (msg.type() === "error") console.log("CONSOLE", msg.text().slice(0, 1300));});
  await page.goto("http://localhost:30042");
  await page.locator("select[name=userId]").selectOption({label: "Gamemaster"});
  await page.getByRole("button", {name: "Join Game Session", exact: true}).click();
  await page.waitForFunction(() => globalThis.game?.ready, null, {timeout: 60000});
  await page.waitForTimeout(1000);
  errors.length = 0;
  assert.equal(await page.evaluate(() => game.world.id), "maneuver-qa");
  await page.evaluate(async () => {
    const config = {...game.settings.get("core", "moduleConfiguration")};
    for (const id of ["swade-better-setting", "swade-better-effects", "swade-better-powers", "swade-better-templates", "swade-hud", "swade-tools", "swade-targeted-damage"]) config[id] = true;
    await game.settings.set("core", "moduleConfiguration", config);
  });
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.ready, null, {timeout: 60000});
  await page.waitForTimeout(1000);
  errors.length = 0;
  await page.addStyleTag({content: "#notifications {pointer-events:none!important}"});
  const ids = await page.evaluate(async blind => {
    const q = globalThis.chatFixQA = {actors: [], messages: []};
    q.actor = await Actor.create({name: "Chat regression caster", type: "character", items: [
      {...blind, _id: undefined, flags: {...blind.flags, "swade-better-powers": {...blind.flags["swade-better-powers"], applyEffects: {}}}},
      {name: "Bending", type: "skill", system: {attribute: "spirit", die: {sides: 8}}},
      {name: "Fighting", type: "skill", system: {swid: "fighting", attribute: "agility", die: {sides: 8}}},
      {name: "Blade", type: "weapon", system: {damage: "2d6", description: "<p>Weapon description regression.</p>", actions: {trait: "Fighting"}}}
    ]});
    q.actors.push(q.actor);
    for (const max of [0, 1, 2]) q.actors.push(await Actor.create({name: "Extra capacity " + max, type: "npc", system: {wounds: {max}}}));
    q.scene = await Scene.create({name: "Chat regression scene", width: 1200, height: 800, active: true,
      tokens: q.actors.map((actor, i) => ({name: actor.name, actorId: actor.id, actorLink: i === 0, x: i * 150, y: 100}))});
    await q.scene.view();
    q.tokens = q.scene.tokens.contents.slice(1);
    q.combat = await Combat.create({scene: q.scene.id});
    await q.combat.createEmbeddedDocuments("Combatant", q.tokens.map(token => ({tokenId: token.id, actorId: token.actorId, sceneId: q.scene.id})));
    q.weapon = q.actor.items.getName("Blade"); q.blind = q.actor.items.getName(blind.name);
    const {makeContext} = await import("/modules/swade-better-effects/scripts/roll-context.mjs");
    q.message = async (item, total, type = "trait", flags = {}) => {
      const RollClass = type === "damage" ? CONFIG.Dice.DamageRoll : CONFIG.Dice.SwadeRoll;
      const roll = await new RollClass(String(total), {}, {rollType: type}).evaluate();
      const context = makeContext(q.actor, item, ["attack", "melee"], {kind: type});
      Object.assign(context, {rollType: type, targetUuids: q.tokens.map(token => token.uuid)});
      const message = await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: q.actor}), rolls: [roll],
        flags: {...flags, "swade-better-effects": {context}, swade: {targets: q.tokens.map(t => ({uuid: t.uuid, name: t.name}))}}});
      q.messages.push(message); return message;
    };
    q.attack = await q.message(q.weapon, 9);
    q.success = await q.message(q.weapon, 4);
    q.failure = await q.message(q.weapon, 1);
    q.cast = await q.message(q.blind, 8, "trait", {"swade-better-powers": {powerCast: {
      id: foundry.utils.randomID(), itemUuid: q.blind.uuid, actorUuid: q.actor.uuid, targetNumber: 4, modifierOptions: {}
    }}});
    return {attack: q.attack.id, success: q.success.id, failure: q.failure.id, cast: q.cast.id, token: q.tokens[0].uuid};
  }, blind);
  const attack = page.locator(`.chat-message[data-message-id="${ids.attack}"]`).first();
  const cast = page.locator(`.chat-message[data-message-id="${ids.cast}"]`).first();
  await attack.locator(".sbs-chat-description").waitFor();
  await page.waitForFunction(id => document.querySelector(`.chat-message[data-message-id="${id}"] .sbs-power-description`)?.textContent.includes("Weapon description"), ids.attack);
  await cast.locator(".template-controls button[data-template]").first().waitFor();
  assert.equal(await cast.locator(".template-controls button[data-template]").count(), 2);
  assert.equal(await attack.locator(".sbs-attack-outcome[data-outcome=raise]").count(), 3);
  for (const outcome of ["success", "failure"]) {
    const card = page.locator(`.chat-message[data-message-id="${ids[outcome]}"]`).first();
    await card.locator(`.sbs-attack-outcome[data-outcome="${outcome}"]`).first().waitFor();
    assert.equal(await card.locator(`.sbs-attack-outcome[data-outcome="${outcome}"]`).count(), 3);
  }
  console.log("PASS weapon descriptions and raised outcomes; exported Blind has MBT and LBT controls without HUD cast markers");
  const rerolled = await page.evaluate(async () => {
    const data = chatFixQA.cast.toObject(); delete data._id;
    data.content = document.querySelector(`.chat-message[data-message-id="${chatFixQA.cast.id}"] .message-content`).innerHTML;
    const message = await ChatMessage.create(data); chatFixQA.messages.push(message); return message.id;
  });
  const reroll = page.locator(`.chat-message[data-message-id="${rerolled}"]`).first();
  await reroll.locator(".sbs-power-description p").first().waitFor();
  assert.equal(await reroll.locator(".sbs-chat-description").count(), 1);
  console.log("PASS copied reroll markup contains exactly one description accordion");

  const before = await page.evaluate(() => {chatFixQA.inline = game.modules.get("swade-better-effects").api; return game.messages.size;});
  await attack.locator('[data-action="target-damage"]').first().dispatchEvent("click");
  await page.locator(".roll-dialog").waitFor();
  assert.equal(await page.evaluate(() => game.messages.size), before);
  await page.locator('.roll-dialog button[type="submit"]').first().click();
  await page.waitForTimeout(700);
  console.log("INLINE", await page.evaluate(() => ({saved: chatFixQA.attack.getFlag("swade-better-effects", "inlineDamage"),
    notifications: document.querySelector("#notifications")?.textContent})));
  await attack.locator(".sbe-target-damage-result").first().waitFor();
  assert.equal(await page.evaluate(() => game.messages.size), before);
  console.log("PASS inline damage opens a normal roll dialog, then saves into the original badge");
  const savedDamage = await page.evaluate(async () => {
    const {recordDamageResolution} = await import("/modules/swade-better-effects/scripts/inline-damage.mjs");
    await recordDamageResolution(chatFixQA.attack, chatFixQA.tokens[0], "none");
    return chatFixQA.attack.getFlag("swade-better-effects", `inlineDamage.${chatFixQA.tokens[0].id}`).id;
  });
  await page.waitForFunction(id => document.querySelector(`.chat-message[data-message-id="${id}"] [data-action="target-damage"]`)?.getAttribute("aria-disabled") === "true", ids.attack);
  await attack.locator('[data-action="target-damage"]').first().dispatchEvent("contextmenu");
  await page.waitForFunction(id => document.querySelector(`.chat-message[data-message-id="${id}"] [data-action="target-damage"]`)?.getAttribute("aria-disabled") === "false", ids.attack);
  assert.equal(await page.evaluate(() => chatFixQA.attack.getFlag("swade-better-effects", `inlineDamage.${chatFixQA.tokens[0].id}`).id), savedDamage);
  console.log("PASS RMB unlocks a resolved badge and preserves its saved damage");

  const damage = await page.evaluate(async () => {
    const q = chatFixQA;
    const {resolveMessageDamage} = await import("/modules/swade-better-effects/scripts/damage.mjs");
    const results = [];
    for (const token of q.tokens) {
      const actor = token.actor, max = actor.system.wounds.max;
      const message = await q.message(q.weapon, actor.system.stats.toughness.value + 4 * (max + 1), "damage");
      await resolveMessageDamage(message, {tokens: [token]});
      const app = [...foundry.applications.instances.values()].find(app => app.rendered && app.sbeMessage?.id === message.id);
      const intended = app.object.wounds;
      await app.options.actions.takeWounds.call(app, {}, null);
      results.push({max, intended, value: actor.system.wounds.value, incapacitated: actor.statuses.has("incapacitated"),
        overlay: actor.effects.some(effect => effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED) && effect.getFlag("core", "overlay")),
        defeated: q.combat.combatants.find(c => c.tokenId === token.id).defeated});
    }
    return results;
  });
  console.log("LETHAL", damage);
  for (const result of damage) {
    assert.equal(result.intended, result.max + 1);
    assert.equal(result.value, result.max);
    assert.ok(result.incapacitated && result.overlay && result.defeated);
  }
  console.log("PASS Extras with 0, 1, and 2 Wound capacity become incapacitated with defeated overlays and combat flags");
  const fallback = await page.evaluate(async () => {
    const q = chatFixQA, token = q.tokens[2], actor = token.actor;
    await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.map(effect => effect.id));
    await actor.update({"system.wounds.value": 0});
    const {ConditionalDamageApplicator} = await import("/modules/swade-better-effects/scripts/damage.mjs");
    // Exercise the fallback with Targeted Damage's unconditional native-damage
    // stop hook removed, matching a world where that optional module is off.
    const blocker = Hooks.events.swadePreCalcWounds.find(entry =>
      /^\(actor, damageContext, woundsInflicted, statusToApply\) =>\s*\{\s*return false;\s*\}$/.test(entry.fn.toString()));
    if (!blocker) throw new Error("Expected Targeted Damage's stop hook");
    Hooks.off("swadePreCalcWounds", blocker.id);
    const apply = async wounds => {
      const message = await q.message(q.weapon, actor.system.stats.toughness.value + wounds * 4, "damage");
      const app = new ConditionalDamageApplicator({actor, token, message, key: message.id});
      await app.render({force: true}); await app.takeDamage();
      return {wounds: actor.system.wounds.value, incapacitated: actor.statuses.has("incapacitated")};
    };
    try {
      return {atCapacity: await apply(2), beyondCapacity: await apply(1),
        overlay: actor.effects.some(effect => effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED) && effect.getFlag("core", "overlay"))};
    } finally { Hooks.on("swadePreCalcWounds", blocker.fn); }
  });
  assert.deepEqual(fallback, {atCapacity: {wounds: 2, incapacitated: false}, beyondCapacity: {wounds: 2, incapacitated: true}, overlay: true});
  console.log("PASS fallback resolver respects Wound capacity and defeats on the next Wound");

  const shaken = await page.evaluate(async () => {
    const token = chatFixQA.tokens[1], actor = token.actor;
    const {default: Char} = await import("/modules/swade-tools/scripts/class/Char.js");
    if (!actor.statuses.has("shaken")) await actor.toggleActiveEffect("shaken", {active: true});
    await Promise.all([new Char(actor).off("isShaken"), new Char(actor).off("isShaken")]);
    const removed = !actor.statuses.has("shaken");
    await Promise.all([new Char(actor).on("isShaken"), new Char(actor).on("isShaken")]);
    if (actor.effects.filter(effect => effect.statuses.has("shaken")).length !== 1) throw new Error("Duplicate Shaken effect");
    const {default: RollControl} = await import("/modules/swade-tools/scripts/class/RollControl.js");
    const mock = {getActor: () => actor, roll: {total: 6, isCritfail: false}, gmmod: 0,
      html: {append() {return {on() {return {ready() {}}}}}}};
    await RollControl.prototype.unshaken.call(mock);
    return {removed, recovered: !actor.statuses.has("shaken")};
  });
  assert.deepEqual(shaken, {removed: true, recovered: true});
  console.log("PASS synthetic token Shaken removal from Tools and automatic recovery");
  assert.deepEqual(errors, []);
} finally {
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    await page.evaluate(async () => {
      const q = globalThis.chatFixQA;
      if (!q) return;
      for (const app of foundry.applications.instances.values()) if (app.sbeMessage || app.constructor.name === "RollDialog") await app.close();
      for (const doc of [...q.messages, q.combat, q.scene, ...q.actors].filter(Boolean)) await doc.delete();
    }).catch(() => {});
  }
  await browser.close();
}

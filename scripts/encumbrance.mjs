import {MODULE_ID} from "./skills.mjs";
import {wrapMethod} from "./integrations.mjs";

const ARMOR_SETTING = "armorStrengthPenalties";
const ENCUMBRANCE_SETTING = "effectEncumbrance";
const STATUS = "encumbered";
const AUTO = "weightEncumbered";
const OVERRIDE = "encumbranceDismissed";
const OVERLOAD = "encumbranceOverload";
const FATIGUE_MODIFIER = "Encumbered (Resist Fatigue)";
const PACE_TYPES = ["ground", "fly", "swim", "burrow"];
const WEIGHT_ITEMS = new Set(["armor", "weapon", "shield", "gear", "consumable"]);
const WEIGHT_FIELDS = ["weight", "quantity", "equipStatus"];
const pending = new Map();
const fatigueRolls = new Set();

const enabled = key => game.settings.get(MODULE_ID, key);
const creature = actor => actor && !actor.pack && ["character", "npc"].includes(actor.type);
const encumbered = actor => actor.statuses.has(STATUS);
const carry = actor => actor.system.details.encumbrance;
const overloaded = actor => carry(actor).max > 0 && carry(actor).value >= 3 * carry(actor).max;
const loadState = actor => actor.isToken ? actor.token : actor;
const ownsAutomation = actor => game.users.activeGM?.isSelf ??
  game.users.find(user => user.active && actor.testUserPermission(user, "OWNER"))?.isSelf;

export function registerEncumbranceSettings() {
  game.settings.register(MODULE_ID, ARMOR_SETTING, {
    name: "Armor Minimum Strength Penalties",
    hint: "For equipped armor, subtract 1 from Pace, Agility rolls, and Agility-linked skill rolls for each die step below the requirement.",
    scope: "world", config: true, type: Boolean, default: true, onChange: refreshActors
  });
  game.settings.register(MODULE_ID, ENCUMBRANCE_SETTING, {
    name: "Encumbered Effect Automation",
    hint: "Use the Encumbered effect for load penalties and Vigor tests. Adds the status when over the weight limit. Turning this off restores SWADE's own encumbrance setting.",
    scope: "world", config: true, type: Boolean, default: true, onChange: refreshActors
  });
}

// The displayed d12+N is N steps above d12. Flat modifiers on smaller dice
// do not change their die type. The system's carrying Strength steps cover Brawny and Soldier.
function strengthStep(sides, bonus = 0) {
  if (sides >= 12) return 5 + Math.max(0, Math.trunc((sides - 12) / 2) + bonus);
  return Math.max(0, Math.floor((sides - 2) / 2));
}

function preparePenalties(actor) {
  const {system} = actor;
  const {pace} = system;
  let pacePenalty = 0;
  if (enabled(ARMOR_SETTING)) {
    const {die, encumbranceSteps} = system.attributes.strength;
    const step = strengthStep(die.sides, die.modifier) + Math.max(0, encumbranceSteps);
    for (const armor of actor.itemTypes.armor) {
      if (armor.system.equipStatus < CONFIG.SWADE.CONST.EQUIP_STATE.EQUIPPED) continue;
      const requirement = armor.system.minStr.trim().match(/^(?:d\s*)?(\d+)(?:\s*\+\s*(\d+))?$/i);
      if (!requirement) continue;
      const shortfall = strengthStep(Number(requirement[1]), Number(requirement[2] ?? 0)) - step;
      if (shortfall <= 0) continue;
      pacePenalty += shortfall;
      system.stats.globalMods.agility.push({label: `${game.i18n.localize("SWADE.MinStr")} (${armor.name})`, value: -shortfall});
    }
  }
  const hasEffect = enabled(ENCUMBRANCE_SETTING) && encumbered(actor);
  const heavyLoad = hasEffect && overloaded(actor);
  if (hasEffect) pace.running.mod -= 2;
  for (const key of PACE_TYPES) {
    if (pace[key] === null) continue;
    // SWADE applies wounds and its Pace floor immediately after this hook.
    pace[key] = heavyLoad ? 1 : pace[key] - pacePenalty;
  }
}

function sceneActors(scene = game.scenes.viewed ?? game.scenes.active) {
  return (scene?.tokens.contents ?? []).map(token => token.actor).filter(actor => actor);
}

function refreshActors() {
  if (!game.ready) return;
  for (const actor of new Set([...game.actors, ...sceneActors()])) {
    if (!creature(actor)) continue;
    actor.reset();
    actor.render(false);
    schedule(actor);
  }
}

function schedule(actor, {dismiss = false, recalculate = false, check = false} = {}) {
  if (!creature(actor) || !ownsAutomation(actor)) return;
  const uuid = actor.uuid;
  // Deleting an effect also prepares the actor. Remember the load at deletion
  // so that this refresh does not itself undo the manual removal.
  const {value: weight, max: capacity} = carry(actor);
  const dismissedLoad = dismiss ? {weight, capacity} : null;
  const previous = pending.get(uuid) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const document = loadState(actor);
    if (!ownsAutomation(actor) || document.collection?.get(document.id) !== document) return;
    await syncEffect(actor, {dismissedLoad, recalculate});
    if (check) await checkOverload(actor);
  }).catch(error => console.error(`${MODULE_ID} | Could not update encumbrance for ${actor.name}`, error));
  pending.set(uuid, operation);
  void operation.finally(() => { if (pending.get(uuid) === operation) pending.delete(uuid); });
}

function scheduleActorAndTokens(actor, options) {
  if (!creature(actor)) return;
  schedule(actor, options);
  if (actor.isToken) return;
  // Foundry refreshes unlinked actors when their base Actor changes, without emitting updateActor for them.
  for (const token of actor.getDependentTokens({concreteOnly: true})) {
    if (!token.actorLink) schedule(token.actor, {recalculate: options?.recalculate});
  }
}

async function syncEffect(actor, {dismissedLoad, recalculate}) {
  const document = loadState(actor);
  const automatic = actor.effects.find(effect => effect.getFlag(MODULE_ID, AUTO));
  const {value: weight, max: capacity} = carry(actor);
  const overweight = enabled(ENCUMBRANCE_SETTING) && weight > capacity;
  let dismissed = document.getFlag(MODULE_ID, OVERRIDE);
  if (dismissedLoad && overweight && !encumbered(actor)) {
    dismissed = dismissedLoad;
    await document.setFlag(MODULE_ID, OVERRIDE, dismissed);
  }
  if (dismissed === true && overweight && !recalculate) {
    // Older worlds only recorded that the effect had been removed.
    dismissed = {weight, capacity};
    await document.setFlag(MODULE_ID, OVERRIDE, dismissed);
  }
  if (dismissed && (!overweight || recalculate || dismissed.weight !== weight || dismissed.capacity !== capacity)) {
    await document.unsetFlag(MODULE_ID, OVERRIDE);
    dismissed = false;
  }

  if (automatic && !overweight) await automatic.delete({[MODULE_ID]: true});
  const hasStatusDocument = actor.effects.some(effect => effect.statuses.has(STATUS));
  if (overweight && !hasStatusDocument && !encumbered(actor) && !dismissed) {
    const Effect = CONFIG.ActiveEffect.documentClass;
    const effect = await Effect.fromStatusEffect(STATUS, {parent: actor});
    effect.updateSource({[`flags.${MODULE_ID}.${AUTO}`]: true});
    await Effect.create(effect.toObject(), {parent: actor, keepId: true, [MODULE_ID]: true});
  }

  const clock = document.getFlag(MODULE_ID, OVERLOAD);
  if (overweight && overloaded(actor) && encumbered(actor)) {
    if (!clock) await document.setFlag(MODULE_ID, OVERLOAD, {since: game.time.worldTime});
  } else if (clock) await document.unsetFlag(MODULE_ID, OVERLOAD);
}

async function checkOverload(actor) {
  if (!game.user.isActiveGM || fatigueRolls.has(actor.uuid) || actor.system.status.isIncapacitated) return;
  const document = loadState(actor);
  const clock = document.getFlag(MODULE_ID, OVERLOAD);
  if (!clock) return;
  const now = game.time.worldTime;
  const roundTime = CONFIG.time.roundTime;
  const gracePeriod = actor.system.attributes.vigor.die.sides * roundTime;
  if (now < clock.since + gracePeriod || now < (clock.checked ?? -Infinity) + roundTime) return;
  fatigueRolls.add(actor.uuid);
  try {
    await document.setFlag(MODULE_ID, OVERLOAD, {...clock, checked: now});
    void resistOverload(actor).catch(error => console.error(`${MODULE_ID} | Encumbrance Vigor test failed`, error))
      .finally(() => fatigueRolls.delete(actor.uuid));
  } catch (error) {
    fatigueRolls.delete(actor.uuid);
    throw error;
  }
}

async function resistOverload(actor) {
  const title = "Encumbrance: Resist Fatigue";
  const roll = await actor.rollAttribute("vigor", {title, flavour: title, resistFatigue: true});
  if (!roll || roll.successes > 0) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["sbs-setting-dialog"], rejectClose: false, modal: false,
    window: {title: `${actor.name}: Apply Fatigue?`},
    content: "<p>The Vigor test failed. Apply one level of Fatigue after resolving any Benny rerolls.</p>",
    yes: {label: "Apply Fatigue"}, no: {label: "Dismiss", default: true}
  });
  if (!confirmed || !enabled(ENCUMBRANCE_SETTING) || actor.system.status.isIncapacitated) return;
  const {fatigue} = actor.system;
  if (fatigue.value >= fatigue.max) await actor.toggleStatusEffect("incapacitated", {active: true});
  else await actor.update({"system.fatigue.value": fatigue.value + 1});
}

async function installToolsCompatibility() {
  if (!game.modules.get("swade-tools")?.active) return;
  const path = foundry.utils.getRoute("modules/swade-tools/scripts/class/CharRoll.js");
  const {default: CharRoll} = await import(new URL(path, window.location.href).href);
  if (typeof CharRoll.prototype.agilityMods !== "function") return;
  wrapMethod(CharRoll.prototype, "agilityMods", function (original) {
    if (!creature(this.actor)) return original();
    // Tools already includes SWADE's global Agility modifiers on both roll paths.
    if (this.actor.system.encumbered) this.addModifier(-2, game.i18n.localize("SWADE.Encumbered"));
  });
}

export function installEncumbrance() {
  const creatureModel = Object.getPrototypeOf(CONFIG.Actor.dataModels.character.prototype);
  const descriptor = Object.getOwnPropertyDescriptor(creatureModel, "encumbered");
  Object.defineProperty(creatureModel, "encumbered", {...descriptor, get() {
    // Let SWADE's rolls and derived Pace consume exactly one source of encumbrance.
    return enabled(ENCUMBRANCE_SETTING) ? encumbered(this.parent) : descriptor.get.call(this);
  }});
  Hooks.on("swadeActorPrepareDerivedData", preparePenalties);

  wrapMethod(CONFIG.Actor.documentClass.prototype, "rollAttribute", function (original, attribute, options = {}) {
    if (attribute !== "vigor" || !creature(this) || !enabled(ENCUMBRANCE_SETTING) || !encumbered(this)) {
      return original(attribute, options);
    }
    if (!options.resistFatigue && options.suppressChat) return original(attribute, options);
    const modifier = {label: FATIGUE_MODIFIER, value: -2, ignore: !options.resistFatigue};
    return original(attribute, {...options, additionalMods: [...(options.additionalMods ?? []), modifier]});
  });

  Hooks.once("ready", () => {
    refreshActors();
    void installToolsCompatibility().catch(error => console.error(`${MODULE_ID} | SWADE Tools encumbrance compatibility failed`, error));
  });
  Hooks.on("canvasReady", canvas => { for (const actor of sceneActors(canvas.scene)) schedule(actor); });
  Hooks.on("userConnected", () => { if (game.user.isActiveGM) refreshActors(); });
  Hooks.on("createActor", actor => scheduleActorAndTokens(actor));
  Hooks.on("updateActor", (actor, changes) => scheduleActorAndTokens(actor, {
    recalculate: foundry.utils.hasProperty(changes, "system.attributes.strength")
  }));
  for (const hook of ["createToken", "updateToken"]) Hooks.on(hook, token => schedule(token.actor));
  for (const hook of ["createItem", "deleteItem"]) {
    Hooks.on(hook, item => scheduleActorAndTokens(item.actor, {recalculate: WEIGHT_ITEMS.has(item.type)}));
  }
  Hooks.on("updateItem", (item, changes) => scheduleActorAndTokens(item.actor, {
    recalculate: WEIGHT_ITEMS.has(item.type) && WEIGHT_FIELDS.some(field => foundry.utils.hasProperty(changes, `system.${field}`))
  }));
  Hooks.on("createActiveEffect", effect => scheduleActorAndTokens(effect.actor));
  Hooks.on("updateActiveEffect", effect => scheduleActorAndTokens(effect.actor));
  Hooks.on("deleteActiveEffect", (effect, options) => scheduleActorAndTokens(effect.actor, {
    dismiss: !options[MODULE_ID] && effect.parent === effect.actor && effect.statuses.has(STATUS)
  }));
  Hooks.on("combatTurnChange", combat => {
    if (enabled(ENCUMBRANCE_SETTING) && !combat.combatant?.isDefeated) schedule(combat.combatant?.actor, {check: true});
  });
  Hooks.on("updateWorldTime", (_time, delta) => {
    if (!enabled(ENCUMBRANCE_SETTING) || !game.user.isActiveGM || delta <= 0) return;
    const inCombat = new Set(game.combats.filter(combat => combat.started)
      .flatMap(combat => combat.combatants.map(combatant => combatant.actor?.uuid)));
    const actors = new Set([...game.actors.filter(actor => actor.hasPlayerOwner || actor.type === "character"), ...sceneActors()]);
    for (const actor of actors) {
      if (creature(actor) && !inCombat.has(actor.uuid) && loadState(actor).getFlag(MODULE_ID, OVERLOAD)) schedule(actor, {check: true});
    }
  });
}

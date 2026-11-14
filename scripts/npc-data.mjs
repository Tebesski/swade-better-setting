import {ATTRIBUTES, MIN_CR, RANKS, advancementStrength, bounded, creatureRating, parseDamage, roundCR} from "./npc-math.mjs";
import {MODULE_ID, normalizeName, slug} from "./skills.mjs";
import {BETTER_POWERS, compileCasting} from "./npc-casting.mjs";
import {tokenFootprint} from "./npc-size.mjs";

export const EFFECTS = "swade-better-effects";
export const NPC_FLAG = `flags.${MODULE_ID}.npc`;
export const ROLE_PROFILES = {
  soldier: {label: "Soldier", focus: "Fighting", mode: "melee", attributes: [1, 0, 0, 1, 1], skills: {Athletics: 1, Notice: 1, Shooting: 0}, armor: 1},
  brute: {label: "Brute", focus: "Fighting", mode: "melee", attributes: [0, -1, 0, 2, 2], skills: {Athletics: 1, Intimidation: 1, Notice: 0},
    skillAttributes: {fighting: "strength"}, damageTier: 2},
  defender: {label: "Defender", focus: "Fighting", mode: "melee", attributes: [0, 0, 1, 1, 2], skills: {Athletics: 0, Notice: 1}, armor: 2, damageTier: 0, parry: 1},
  skirmisher: {label: "Skirmisher", focus: "Fighting", mode: "melee", attributes: [2, 0, 0, 0, 0], skills: {Athletics: 2, Stealth: 2, Notice: 1, Thievery: 0}, pace: 8, damageTier: 0},
  marksman: {label: "Marksman", focus: "Shooting", mode: "ranged", attributes: [2, 0, 0, 0, 0], skills: {Fighting: 0, Notice: 2, Stealth: 1}},
  caster: {label: "Caster", focus: "Spellcasting", mode: "power", attributes: [0, 2, 1, -1, 0], skills: {Fighting: 0, Occult: 2, Notice: 1}},
  support: {label: "Support", focus: "Healing", mode: "melee", attributes: [0, 2, 1, 0, 0], skills: {Fighting: 0, Notice: 1, Persuasion: 1, Battle: 1}, damageTier: 0},
  specialist: {label: "Noncombat specialist", focus: "Persuasion", mode: "none", attributes: [0, 1, 2, -1, 0], skills: {Notice: 1, Research: 1, "Common Knowledge": 0}},
  beast: {label: "Beast", focus: "Fighting", mode: "melee", attributes: [1, 0, 0, 1, 1], skills: {Athletics: 1, Notice: 2, Stealth: 1, Survival: 1}, pace: 8}
};

const increment = (step, ceiling = 6) => {
  const tier = bounded(step, 0, ceiling);
  return {sides: Math.min(12, 4 + tier * 2), modifier: Math.max(0, tier - 4)};
};

export function rankIndex(value) { return RANKS.findIndex(rank => normalizeName(rank) === normalizeName(value)); }

const MELEE_DAMAGE = ["1d4", "1d6", "1d6+1", "1d8", "1d8+1", "1d10", "1d12"];
const OTHER_DAMAGE = ["1d4+1d6", "2d6", "1d6+1d8", "2d8", "1d8+1d10", "2d10", "1d10+1d12"];
export function damageBenchmarks(rank, mode, size) {
  if (mode === "none") return [];
  if (mode === "melee" && size === -4) return [{label: "Tiny melee", formula: "1"}];
  const tier = Math.max(0, rankIndex(rank));
  const formulas = mode === "melee" ? MELEE_DAMAGE : OTHER_DAMAGE;
  return ["Low", "Standard", "High"].map((label, i) => ({
    label, formula: (mode === "melee" ? "@str+" : "") + formulas[tier + i]
  }));
}
export function npcRank(actor) {
  const explicit = actor.flags?.[MODULE_ID]?.npc?.rank;
  const advances = actor.system?.advances;
  const index = rankIndex(explicit ?? advances?.rank);
  if (index >= 0) return RANKS[index];
  if (Number.isFinite(advances?.value)) return RANKS[bounded(Math.floor(advances.value / 4), 0, 4)];
  return "Unrated";
}

export function makePreset(role, rank, focus, modeOverride, wildcard = false, profile = ROLE_PROFILES[role]) {
  const step = Math.max(0, rankIndex(rank));
  const focusSkill = focus || profile.focus;
  const support = Object.entries(profile.skills).sort((a, b) => b[1] - a[1]);
  const specialty = support.find(([name]) => name !== focusSkill)?.[0];
  const progress = (rate, fallback) => ({rank: step, half: Math.floor((step + 1) / 2), fixed: 0})[rate] ?? fallback;
  const skillLevels = Object.entries(profile.skills).map(([name, tier]) => [name,
    increment(tier + progress(profile.skillGrowth?.[slug(name)], tier > 0 ? step : Math.floor((step + 1) / 2)) +
      Number(wildcard && name === specialty), 4)]);
  const skills = Object.fromEntries(skillLevels);
  if (focusSkill !== profile.focus) skills[profile.focus] = increment((profile.focusDie ?? 1) + step, 4);
  skills[focusSkill] = increment((profile.focusDie ?? 1) + step);
  const strongAttribute = profile.attributes.indexOf(Math.max(...profile.attributes));
  const attributes = Object.fromEntries(ATTRIBUTES.map((key, i) => {
    const tier = profile.attributes[i];
    const growth = i === strongAttribute ? step : tier > 0 ? Math.floor((step + 1) / 2) : 0;
    return [key, increment(tier + 1 + progress(profile.attributeGrowth?.[key], growth) + Number(wildcard && i === strongAttribute), 4)];
  }));
  const mode = modeOverride ?? profile.mode;
  const custom = !modeOverride || modeOverride === profile.mode ? profile.attack ?? {} : {};
  const damage = mode === "none" ? "" : custom.damage || damageBenchmarks(rank, mode)[profile.damageTier ?? 1]?.formula || "";
  const attackName = custom.name || (mode === "power" ? "Arcane Strike" : mode === "ranged" ? "Ranged Strike" : role === "beast" ? "Bite" : "Melee Strike");
  return {attributes, skills, mode, attackName, damage,
    trait: custom.trait || (mode === "ranged" ? "Shooting" : mode === "power" ? role === "caster" ? focusSkill : "Spellcasting" : "Fighting"),
    ap: custom.ap ?? 0, armor: profile.armor ?? 0, parry: profile.parry ?? 0, size: profile.size ?? 0,
    ground: profile.pace ?? 6, run: 6, fly: 0, swim: 0, burrow: 0, runMod: 0, paceBase: "",
    hardy: profile.hardy ?? false, animal: profile.animal ?? (role === "beast"), resilience: profile.resilience ?? 0,
    core: profile.core ?? (role !== "beast"), signatureRof: custom.rof ?? 1, powerCost: custom.pp ?? 2,
    range: custom.range || (mode === "ranged" ? "12/24/48" : mode === "power" ? "12" : "")};
}

export function sizeWounds(size) { return size >= 12 ? 3 : size >= 8 ? 2 : size >= 4 ? 1 : 0; }

export function sizeStrength(size, base) {
  if (size === -4) return {sides: 1, modifier: 0};
  if (size === -3 || size === -2) return {sides: 4, modifier: size === -3 ? -3 : -1};
  if (size === -1) return base.sides > 6 ? {sides: 6, modifier: 0} : base;
  if (size >= 4) return {sides: 12, modifier: bounded(base.modifier, size - 3, size)};
  const minimum = 6 + size * 2;
  return base.sides < minimum && size > 0 ? {sides: minimum, modifier: 0}
    : base.sides === 12 && base.modifier > size ? {sides: 12, modifier: size} : base;
}

export function managedTags(previous, rank, wildcard, role, more = [], api) {
  const managed = new Set([...RANKS.map(normalizeName), "extra", "wildcard"]);
  const toList = values => Array.isArray(values) ? values : String(values ?? "").split(",");
  const normalize = api?.normalizeFlags ?? (flags => [...new Set(flags.map(slug).filter(Boolean))].sort());
  const custom = normalize([...toList(previous), ...toList(more)]).filter(flag => !managed.has(flag));
  return normalize([...custom, normalizeName(rank), wildcard ? "wildcard" : "extra", role]);
}

export function attackTags(value, api) {
  const normalize = api?.normalizeFlags ?? (tags => [...new Set(tags.map(slug).filter(Boolean))]);
  return normalize(String(value ?? "").split(","));
}

function diceOf(document, wildcard) {
  const die = document?.die;
  if (!die?.sides) return {sides: 4, modifier: -2, wild: wildcard ? 6 : 0};
  return {sides: die.sides, modifier: die.modifier ?? 0, wild: wildcard ? document["wild-die"]?.sides || 6 : 0};
}

const SHORT_ATTRS = {agi: "agility", sma: "smarts", spi: "spirit", str: "strength", vig: "vigor"};
export function traitAttribute(name, aliases = true) {
  const key = normalizeName(name);
  if (aliases && SHORT_ATTRS[key]) return SHORT_ATTRS[key];
  return ATTRIBUTES.find(attribute => {
    const label = game.i18n.localize(CONFIG.SWADE.attributes[attribute].long);
    return aliases ? attribute === key || normalizeName(label) === key : label === name;
  });
}

export function findAttackTrait(actor, name, aliases = true) {
  const attr = traitAttribute(name, aliases);
  if (attr) return actor.system.attributes[attr];
  const key = normalizeName(name);
  return actor.itemTypes.skill.find(item => normalizeName(item.name) === key || item.system.swid === slug(name))?.system;
}

const activeValues = mods => (mods ?? []).filter(mod => !mod.ignore).map(mod => mod.value);
const sumFlat = mods => mods.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);

export function actorTrait(actor, source) {
  const die = diceOf(source, actor.isWildcard);
  // The installed SWADE roll reports a single natural 1 as a critical failure for Extras.
  if (!die.wild) die.extraCritChance = 1;
  const attribute = source?.attribute || ATTRIBUTES.find(key => actor.system.attributes[key] === source);
  const mods = actor.system.stats.globalMods ?? {};
  die.modifier += sumFlat([...activeValues(mods.trait), ...activeValues(mods[attribute]), ...activeValues(source?.effects)]);
  if (attribute === "agility" && actor.system.encumbered) die.modifier -= 2;
  return die;
}

function damageFor(actor, text, includeModifiers = false) {
  const data = {...actor.getRollData(includeModifiers), wounds: 0, fatigue: 0};
  return parseDamage(Roll.replaceFormulaData(String(text ?? ""), data));
}

export function usesMelee(item) {
  const {rangeType, actions} = item.system;
  return rangeType === 0 || (rangeType === 2 && findAttackTrait(item.actor, actions?.trait, false)?.swid === "fighting");
}

export function actorCombatProfile(actor) {
  const sys = actor.system;
  const wildcard = actor.isWildcard;
  const scale = sys.stats.scale ?? 0;
  const global = sys.stats.globalMods ?? {};
  const warnings = [];
  const attacks = [];
  const addDamageMods = (result, mods, label, resolve = bonus => damageFor(actor, bonus)) => {
    for (const bonus of mods.filter(Boolean)) {
      if (/@(?:wounds|fatigue)\b/i.test(bonus)) warnings.push(`${label} samples Wounds and Fatigue references at zero.`);
      const adjustment = resolve(bonus);
      if (!adjustment) { warnings.push(`${label} has a damage modifier outside the rating model.`); continue; }
      result.dice.push(...adjustment.dice);
      result.flat += adjustment.flat;
    }
    return result;
  };
  const attackModifiers = Object.fromEntries(["melee", "ranged"].map(mode => [mode, sumFlat([
    ...activeValues(global.targetAttack), ...activeValues(mode === "melee" ? global.targetAttackMelee : global.targetAttackRanged)
  ])]));
  // Incoming roll-data references belong to the attacker, so only use literal target modifiers.
  const damageModifier = addDamageMods({dice: [], flat: 0}, activeValues(global.targetDamage), "Incoming damage", parseDamage);
  const addAttack = ({name, mode, traitName, damage, ap, traitMods = [], damageMods = [], raiseDice, options, resource}) => {
    if (!damage) return;
    const source = findAttackTrait(actor, traitName, false);
    if (!source) warnings.push(`${name} uses an unskilled roll because its attack trait is missing or unknown.`);
    const trait = actorTrait(actor, source);
    trait.modifier += sumFlat(traitMods);
    if (traitMods.some(value => !Number.isFinite(Number(value)))) warnings.push(`${name} has a formula trait modifier.`);
    if (/@(?:wounds|fatigue)\b/i.test(damage)) warnings.push(`${name} samples Wounds and Fatigue references at zero.`);
    const parsed = damageFor(actor, damage, true);
    if (!parsed) warnings.push(`${name} uses a damage formula outside the rating model.`);
    else attacks.push({name, mode, trait, damage: addDamageMods(parsed, damageMods, name), ap: Number(ap) || 0,
      scale, raiseDice, ...options, resource, tinyMelee: sys.stats.size === -4 && mode === "melee"});
  };
  const items = [...actor.itemTypes.weapon.filter(item => item.isReadied), ...actor.itemTypes.power];
  const effectsAPI = game.modules.get(EFFECTS)?.api;
  const powersAPI = game.modules.get(BETTER_POWERS)?.api;
  const actorRules = effectsAPI?.collectRules?.(actor)?.length ?? 0;
  if (actorRules) warnings.push("Better Effects roll rules are outside this benchmark.");
  const special = [...actor.itemTypes.ability ?? [], ...actor.itemTypes.action ?? []];
  if (special.length) warnings.push(`Review special abilities and actions for effects outside the benchmark (${special.map(item => item.name).join(", ")}).`);
  for (const item of items) {
    const system = item.system;
    if (!system.damage) {
      if (item.type === "power") warnings.push(`${item.name} has no modeled damage. Its other effects may affect the fight.`);
      continue;
    }
    const trait = system.actions?.trait ?? "";
    const melee = item.type === "weapon" && usesMelee(item);
    const mode = item.type === "power" ? "power" : melee ? "melee" : "ranged";
    const shots = mode === "ranged" ? bounded(Math.trunc(Number(system.rof)) || 1, 1, 6) : 1;
    if (Object.values(system.templates ?? {}).includes(true)) warnings.push(`${item.name} is rated against one target.`);
    const modifiers = item.type === "power" ? powersAPI?.getModifiers?.(item) ?? item.flags?.[BETTER_POWERS]?.powerModifiers : [];
    if (modifiers?.length || item.flags?.[BETTER_POWERS]?.powerRaises?.length || item.flags?.["swade-better-templates"]?.automation?.enabled) {
      warnings.push(`${item.name} has power or template automation outside the benchmark.`);
    }
    if (Object.keys(system.actions?.additional ?? {}).length) warnings.push(`${item.name} has additional actions outside the benchmark.`);
    if (effectsAPI?.collectRules?.(actor, item)?.length > actorRules) warnings.push(`${item.name} has Better Effects roll rules outside the benchmark.`);
    const mods = activeValues(item.traitModifiers);
    let resource;
    if (mode === "power") {
      const cost = Math.max(0, Number(system.ppModifiers?.cost ?? system.pp) || 0);
      const noPP = powersAPI?.usesNoPowerPoints?.(item) ?? game.settings.get("swade", "noPowerPoints");
      if (noPP) mods.push(-Math.ceil(cost / 2));
      else if (cost) {
        const key = system.arcane || "general";
        const capacity = Number(sys.powerPoints[key]?.max) || 0;
        if (capacity < cost) {
          warnings.push(`${item.name} costs more Power Points than its pool can hold.`);
          continue;
        }
        resource = {key: `pp:${key}`, capacity, cost};
      }
    } else mods.push(...activeValues(melee ? global.attackMelee : global.attackRanged));
    const raiseDice = Array.from({length: bounded(system.bonusDamageDice ?? 1, 0, 12)}, () => bounded(system.bonusDamageDie || 6, 2, 100));
    const ap = (Number(system.ap) || 0) + sumFlat(activeValues(global.ap));
    addAttack({name: item.name, mode, traitName: trait, damage: system.damage, ap, traitMods: mods,
      damageMods: [system.actions?.dmgMod, ...activeValues(global.damage)], raiseDice, options: {shots, recoil: shots > 1}, resource});
  }
  if (!attacks.length && (actor.type === "character" || actor.itemTypes.skill.some(item => item.system.swid === "fighting"))) {
    addAttack({name: "Unarmed", mode: "melee", traitName: "Fighting", damage: "@str", ap: sumFlat(activeValues(global.ap)),
      traitMods: [...activeValues(global.attack), ...activeValues(global.attackMelee)], damageMods: activeValues(global.damage)});
  }
  const profile = {
    parry: sys.stats.parry.value, toughness: sys.stats.toughness.value,
    armor: sys.stats.toughness.armor, scale, wounds: sys.wounds.max,
    bennies: wildcard ? sys.bennies.max : 0, hardy: !!actor.getFlag("swade", "hardy"), ignored: sys.wounds.ignored ?? 0,
    woundsOrFatigueIgnored: sys.woundsOrFatigue?.ignored ?? 0, attackModifiers, damageModifier,
    spirit: actorTrait(actor, sys.attributes.spirit), vigor: actorTrait(actor, sys.attributes.vigor), attacks
  };
  profile.spirit.modifier += sys.attributes.spirit.unShakeBonus ?? 0;
  profile.vigor.modifier += sys.attributes.vigor.soakBonus ?? 0;
  if (game.settings.get("swade", "unarmoredHero") && actor.isUnarmored) profile.vigor.modifier += 2;
  const coverage = !attacks.length ? "Unrated" : warnings.length ? "Partial" : "Modeled";
  return {profile, warnings, coverage};
}

const cache = new WeakMap();
export function estimateActor(actor) {
  const data = actorCombatProfile(actor);
  const woundCap = game.settings.get("swade", "woundCap") ? 4 : 0;
  const key = JSON.stringify([data.profile, woundCap]);
  const last = cache.get(actor);
  if (last?.key === key) return {...last, warnings: data.warnings, coverage: data.coverage};
  const result = {...data, ...creatureRating(data.profile, woundCap), woundCap, key};
  cache.set(actor, result);
  return result;
}

export function actorRating(actor) {
  const manual = actor.flags?.[MODULE_ID]?.npc?.cr;
  const advances = actor.type === "character" ? actor.system?.advances?.value : undefined;
  const overridden = Number.isFinite(manual) && manual >= MIN_CR;
  const rating = overridden ? manual : advances;
  if (overridden || Number.isFinite(advances) && advances >= 0) {
    const cap = game.settings.get("swade", "woundCap") ? 4 : 0;
    return {cr: roundCR(rating), rawCR: rating, strength: advancementStrength(rating, cap),
      coverage: overridden ? "Manual" : "Advances", warnings: []};
  }
  if (!["character", "npc"].includes(actor.type)) return {cr: null, rawCR: null, strength: 0, coverage: "Unrated", warnings: []};
  return estimateActor(actor);
}

export function actorCR(actor, {raw = false} = {}) {
  const estimate = actorRating(actor);
  return raw ? estimate.rawCR : estimate.cr;
}

export const EFFECT_TEMPLATE = `${EFFECTS}.effect`;

export function npcSource(draft, items, token, idFactory, api) {
  const {name, rank, role, wildcard, size, mode, trait} = draft;
  const casting = compileCasting(draft, items, idFactory);
  const wounds = (wildcard ? 3 : 0) + (draft.resilience ?? 0) + (draft.ancestrySizeWounds === false ? 0 : sizeWounds(size));
  const bennies = wildcard ? draft.bennies : 0;
  const npc = {rank, role, coreSkills: draft.core, cr: draft.cr};
  if (draft.archetypeTag) npc.archetypeTag = draft.archetypeTag;
  if (Object.keys(draft.defenses ?? {}).length) npc.defenses = draft.defenses;
  const flags = {[MODULE_ID]: {npc}, [EFFECTS]: {tags: managedTags(draft.archetypeTags, rank, wildcard, draft.archetypeTag ?? role, draft.tags, api)},
    swade: {hardy: draft.hardy}, ...token.flags};
  if (Object.keys(casting.flags).length) flags[BETTER_POWERS] = {spellcastingEntries: casting.flags};
  const actorName = name.trim() || "New NPC";
  const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, {die: draft.attributes[key]}]));
  attributes.smarts.animal = draft.animal;
  if (size === -4) attributes.strength.die = sizeStrength(size, attributes.strength.die);
  const source = {
    name: actorName, type: "npc", folder: draft.folder || null, flags,
    system: {
      wildcard, wounds: {max: wounds}, bennies: {value: bennies, max: bennies},
      advances: {mode: "legacy", value: Math.max(0, rankIndex(rank)) * 4, rank},
      attributes,
      initiative: draft.initiative,
      pace: {base: draft.paceBase || (!draft.ground && (draft.fly && "fly" || draft.swim && "swim" || draft.burrow && "burrow")) || "ground",
        ground: draft.ground, fly: draft.fly, swim: draft.swim, burrow: draft.burrow, running: {die: draft.run, mod: draft.runMod}},
      stats: {size: size - (draft.ancestrySize ?? 0)}, powerPoints: casting.pools,
      details: {archetype: draft.archetypeLabel ?? ROLE_PROFILES[role]?.label ?? "", species: {name: draft.ancestryName ?? ""}}
    },
    items: [], effects: [...(draft.effects ?? [])],
    prototypeToken: {name: actorName, disposition: draft.disposition, actorLink: false,
      ...token.prototypeToken, width: tokenFootprint(size), height: tokenFootprint(size)}
  };
  if (token.img) source.img = token.img;
  const tags = attackTags(draft.signatureTags, api);
  const put = (name, type, system, signature = false) => source.items.push({_id: signature && draft.signatureId ? draft.signatureId : idFactory(),
    name, type, img: `systems/swade/assets/icons/${type}.svg`, system,
    ...(signature && tags.length ? {flags: {[EFFECTS]: {tags}}} : {})});
  for (const item of items) {
    if (item.type === EFFECT_TEMPLATE) {
      for (const effect of item.effects ?? []) source.effects.push({...effect, _id: idFactory(), transfer: false, origin: item._stats?.compendiumSource ?? null});
    } else {
      const melee = item.type === "weapon" && (item.system.rangeType === 0 ||
        (item.system.rangeType === 2 && slug(item.system.actions?.trait) === "fighting"));
      source.items.push(size === -4 && melee ? {...item,
        system: {...item.system, damage: "1", bonusDamageDice: 0, actions: {...item.system.actions, dmgMod: ""}}}
        : casting.apply(item));
    }
  }
  if (draft.armor) put("Natural Armor", "armor", {armor: draft.armor, locations: {torso: true, head: true, arms: true, legs: true}, equipStatus: 3, weight: 0});
  if (draft.parry) source.effects.push({_id: idFactory(), name: "Parry adjustment", img: "systems/swade/assets/icons/active-effect.svg",
    system: {changes: [{key: "system.stats.parry.value", type: "add", value: String(draft.parry)}]}});
  const {weapon, ranged, shared} = draft.signatureOptions ?? {};
  const tinyMelee = size === -4 && mode === "melee";
  if (["melee", "ranged"].includes(mode) && (tinyMelee || draft.damage)) {
    put(draft.attackName.trim() || "Strike", "weapon", {damage: tinyMelee ? "1" : draft.damage, ap: draft.ap, equipStatus: 3,
      range: mode === "ranged" ? draft.range : "", rangeType: mode === "ranged" ? 1 : 0, weight: 0,
      ...weapon, ...(mode === "ranged" ? {rof: draft.signatureRof ?? 1, ...ranged} : {}), ...shared,
      ...(tinyMelee ? {bonusDamageDice: 0} : {}),
      actions: {...shared?.actions, trait, ...(tinyMelee ? {dmgMod: ""} : {})}}, true);
  } else if (mode === "power" && draft.damage) {
    put(draft.attackName.trim() || "Arcane Strike", "power", casting.assign({rank, pp: draft.powerCost, duration: "Instant", range: draft.range,
      damage: draft.damage, ap: draft.ap, ...shared, actions: {...shared?.actions, trait}}, casting.signature), true);
  }
  return source;
}

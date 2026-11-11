import {librarySkills} from "./library.mjs";
import {ChoicePicker} from "./picker.mjs";
import {ATTRIBUTES, RANKS, advancementStrength, bounded, roundCR, traitAtLeast} from "./npc-math.mjs";
import {EFFECTS, EFFECT_TEMPLATE, ROLE_PROFILES, actorTrait, attackTags, damageBenchmarks, estimateActor, findAttackTrait, makePreset, npcSource, rankIndex, sizeStrength, traitAttribute, usesMelee} from "./npc-data.mjs";
import {BETTER_POWERS, GENERAL_ENTRY, addCastingEntry, validEntryName} from "./npc-casting.mjs";
import {MODULE_ID, STANDARD_SKILLS, normalizeName, skillData, slug} from "./skills.mjs";
import {boundedRead} from "./bestiary-catalog.mjs";
import {POWER_THEMES, powerCandidates, powerKey} from "./npc-powers.mjs";
import {attackDetails, setMagazineField} from "./npc-attack.mjs";
import {openNPCFeatureDraft} from "./creation.mjs";
import {renderSizeReference} from "./npc-size.mjs";
import {copyItem, itemChoices, resolveItem} from "./npc-catalog.mjs";
import {ArchetypeEditor} from "./npc-archetypes.mjs";
import {AncestryEditor, ancestryGrantSettings, ancestryTableNotes, prepareAncestry} from "./npc-ancestries.mjs";
import {MOVEMENT_MODES, archetypeLibrary, movementValues, namedMovement, removeMovement, saveMovement} from "./npc-presets.mjs";
import {MovementTable} from "./npc-movement.mjs";
import {chooseLoadout, limitAncestryDie, spendAttributeSteps, variantRoll} from "./npc-forge-options.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const MODES = {melee: "Melee", ranged: "Ranged", power: "Damaging power", none: "None"};
const WEAPON_MODES = {0: "Melee", 1: "Ranged", 2: "Melee and ranged"};
const CASTING_RULES = {inherit: "World setting", pp: "Use Power Points", "no-pp": "No Power Points"};
const DICE = {4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12"};
const FEATURE_TYPES = {edge: "Edges", hindrance: "Hindrances", ability: "Special abilities", action: "Actions",
  armor: "Armor", shield: "Shields", gear: "Gear", consumable: "Consumables", effect: "Effect"};
const ATTACK_OPTIONS_TEMPLATE = `modules/${MODULE_ID}/templates/npc-attack-options.hbs`;
const SIGNATURE = "signature";
const INITIATIVE = [
  {key: "hasLevelHeaded", label: "Level Headed", hint: "Draw two Action Cards and choose one."},
  {key: "hasImpLevelHeaded", label: "Improved Level Headed", hint: "Draw three Action Cards and choose one."},
  {key: "hasQuick", label: "Quick", hint: "Redraw Action Cards of 5 or lower using SWADE’s Quick procedure."},
  {key: "hasHesitant", label: "Hesitant", hint: "Draw two Action Cards and take the lower one unless a Joker is drawn."}
];
const LIMITS = {size: [-4, 20], armor: [0, 40], parry: [-12, 24], ground: [0, 100], run: [4, 12], fly: [0, 100], swim: [0, 100], burrow: [0, 100], runMod: [-20, 20],
  ap: [0, 40], signatureRof: [1, 6], powerCost: [0, 100], bennies: [0, 10], resilience: [0, 2]};
const EDITOR_PARTS = ["identity", "build", "traits"];
const uid = () => foundry.utils.randomID();
const attributeLabels = () => Object.fromEntries(ATTRIBUTES.map(key => [key, game.i18n.localize(CONFIG.SWADE.attributes[key].long)]));
const usesPP = entry => entry.rule === "pp" || (entry.rule === "inherit" && !game.settings.get("swade", "noPowerPoints"));

function report(error) {
  console.error(`${MODULE_ID} | NPC Builder`, error);
  ui.notifications.error(error.message);
}

class NPCBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sbs-npc-builder"], position: {width: 1000, height: 650},
    window: {title: "NPC Builder", icon: "fa-solid fa-hammer", resizable: false},
    actions: {
      art: function (event) { return this.pickArt(event.shiftKey).catch(report); },
      reset: function () {
        this.edited.clear();
        this.draft.defenses = {};
        this.draft.focus = this.archetype.focus;
        this.applyPreset();
        return this.renderDraft();
      },
      addSkill: function () { return this.pickSkill().catch(report); },
      pickTrait: function (_event, target) { return this.pickTrait(target.dataset).catch(report); },
      pickFlag: function (_event, target) { return this.pickFlag(target.dataset.key).catch(report); },
      damageGuide: function (_event, target) { return this.damageGuide(target.dataset.key).catch(report); },
      pickSize: function () { return this.pickSize().catch(report); },
      archetypes: function () { return this.openArchetypes().catch(report); },
      ancestries: function () { return this.openAncestries().catch(report); },
      movementTable: function () {
        if (this.movementTable?.rendered) return this.movementTable.bringToFront();
        this.movementTable = new MovementTable(this);
        return this.movementTable.render({force: true});
      },
      rerollVariants: async function () {
        this.variantSeed = uid();
        await this.syncLoadout();
        this.applyPreset();
        return this.renderDraft();
      },
      addFeature: function () { return (this.featureType === "effect" ? this.pickEffect() : this.pickFeature(this.featureType)).catch(report); },
      addNewFeature: function () { return this.addNewFeature().catch(report); },
      openFeature: function (_event, target) { return this.openFeature(target.dataset.key).catch(report); },
      addWeapon: function () { return this.pickFeature("weapon").catch(report); },
      addAttack: function () { return this.addAttack().catch(report); },
      addPower: function (_event, target) { return this.pickFeature("power", target.dataset.key).catch(report); },
      generatePowers: function (_event, target) { return this.generatePowers(target.dataset.key).catch(report); },
      removeEffect: function (_event, target) {
        this.draft.effects = this.draft.effects.filter(effect => effect._id !== target.dataset.key);
        return this.renderDraft();
      },
      addCasting: function () { return this.addCasting().catch(report); },
      removeCasting: function (_event, target) { return this.removeCasting(target.dataset.key).catch(report); },
      removeSkill: function (_event, target) {
        const key = target.dataset.key;
        this.skills.delete(key);
        this.removed.add(key);
        return this.renderDraft();
      },
      removeFeature: function (_event, target) {
        const key = target.dataset.key;
        const loadout = this.loadoutItems.get(key);
        if (loadout) this.removedLoadout.add(loadout);
        this.loadoutItems.delete(key);
        if (loadout) this.loadoutConfig.delete(loadout);
        this.manualPowerEntries.delete(key);
        this.features = this.features.filter(item => item._id !== key);
        this.attackTags.delete(key);
        delete this.draft.powerEntries[key];
        return this.syncOptions().catch(report);
      },
      create: function () { return this.create().catch(report); }
    }
  };
  static PARTS = {
    identity: {template: `modules/${MODULE_ID}/templates/npc-identity.hbs`},
    build: {template: `modules/${MODULE_ID}/templates/npc-builder.hbs`, templates: [ATTACK_OPTIONS_TEMPLATE], scrollable: [""]},
    traits: {template: `modules/${MODULE_ID}/templates/npc-traits.hbs`, scrollable: [""]},
    footer: {template: `modules/${MODULE_ID}/templates/npc-builder-footer.hbs`}
  };

  constructor(folder) {
    super();
    this.draft = {name: "", rank: RANKS[0], role: "soldier", focus: archetypeLibrary().soldier.focus, wildcard: false,
      bennies: 2, cr: null, tags: "", folder: folder ?? "", disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
      signatureId: uid(), signatureEntry: null, signatureOptions: {shared: {}, weapon: {}, ranged: {}},
      spellcasting: {}, powerEntries: {}, defenses: {}, effects: [], initiative: {}};
    this.attackTags = new Map();
    this.loadoutItems = new Map();
    this.loadoutConfig = new Map();
    this.removedLoadout = new Set();
    this.presetCasting = new Set();
    this.manualPowerEntries = new Set();
    this.variantSeed = uid();
    this.ancestryOptions = {};
    this.skills = new Map();
    this.removed = new Set();
    this.features = [];
    this.edited = new Set();
    this.token = {prototypeToken: {}};
    this.featureType = "ability";
  }

  _updatePosition(position) {
    const {width, height} = this.options.position;
    return super._updatePosition({...position, width, height});
  }

  renderDraft() { return this.render({parts: EDITOR_PARTS}); }
  get archetype() { return archetypeLibrary()[this.draft.role] ?? archetypeLibrary().soldier; }

  async selectArchetype(key) {
    const library = archetypeLibrary();
    this.draft.role = Object.hasOwn(library, key) ? key : "soldier";
    if (!this.edited.has("focus")) this.draft.focus = this.archetype.focus;
    return this.syncOptions();
  }

  async syncOptions() {
    await this.syncLoadout();
    this.applyPreset();
    return this.renderDraft();
  }

  async syncLoadout() {
    const request = this.loadoutRequest = {};
    const key = this.draft.role;
    const refFor = row => `${key}/${row.id ?? row.uuid}`;
    const selected = chooseLoadout(this.archetype.loadout ?? [], this.draft.rank, this.variantSeed,
      row => !this.removedLoadout.has(refFor(row)));
    const pools = this.archetype.casting ?? [];
    const externalEdges = [...this.features.filter(item => !this.loadoutItems.has(item._id)), ...this.ancestry?.items ?? []]
      .filter(item => item.type === "edge");
    const hasEdge = edge => !edge || selected.some(row => row.uuid === edge.uuid) ||
      externalEdges.some(item => normalizeName(item.name) === normalizeName(edge.name) || item._stats?.compendiumSource === edge.uuid);
    const desired = new Map();
    for (const row of selected) {
      const pool = row.type === "power" ? pools.find(pool => normalizeName(pool.name) === normalizeName(row.casting)) : undefined;
      if (!hasEdge(pool?.requires)) continue;
      desired.set(refFor(row), row);
      if (row.ammo) {
        const ammoRef = `${key}/ammo/${row.ammo.uuid}`;
        const quantity = (desired.get(ammoRef)?.quantity ?? 0) + (row.ammoQuantity || 1);
        if (!this.removedLoadout.has(ammoRef)) desired.set(ammoRef, {...row.ammo, quantity});
      }
    }
    const present = new Set(this.loadoutItems.values());
    const changed = ref => this.loadoutConfig.get(ref) !== JSON.stringify(desired.get(ref));
    this.loadoutLoading = true;
    try {
      const added = await Promise.all([...desired].filter(([ref]) => !present.has(ref) || changed(ref)).map(async ([ref, row]) => {
        try { return {ref, row, item: copyItem(await boundedRead(() => resolveItem(row.uuid, row.type)))}; }
        catch (error) { ui.notifications.warn(`Archetype item unavailable: ${row.name}.`); return null; }
      }));
      if (request !== this.loadoutRequest) return;
      this.features = this.features.filter(item => {
        const ref = this.loadoutItems.get(item._id);
        if (!ref || (desired.has(ref) && !changed(ref))) return true;
        this.loadoutItems.delete(item._id);
        this.loadoutConfig.delete(ref);
        this.manualPowerEntries.delete(item._id);
        this.attackTags.delete(item._id);
        delete this.draft.powerEntries[item._id];
        return false;
      });
      for (const {ref, row, item} of added.filter(Boolean)) {
        if (["weapon", "armor", "shield"].includes(item.type)) item.system.equipStatus = 3;
        if ("equipStatus" in item.system && row.equip !== "" && row.equip !== undefined) item.system.equipStatus = Number(row.equip);
        if ("quantity" in item.system && row.quantity) item.system.quantity = row.quantity;
        if (item.type === "weapon" && row.ammo) item.system.ammo = row.ammo.name;
        this.loadoutItems.set(item._id, ref);
        this.loadoutConfig.set(ref, JSON.stringify(row));
        this.features.push(item);
      }
      for (const item of this.features) {
        const row = desired.get(this.loadoutItems.get(item._id));
        if (row && item.type === "power" && !this.manualPowerEntries.has(item._id)) this.assignPresetPower(item, row.casting, pools, hasEdge);
      }
      this.syncAncestryPowers();
      const assigned = new Set(Object.values(this.draft.powerEntries));
      for (const id of this.presetCasting) if (!assigned.has(id) && id !== this.draft.signatureEntry) {
        this.presetCasting.delete(id);
        delete this.draft.spellcasting[id];
      }
    } finally {
      if (request === this.loadoutRequest) this.loadoutLoading = false;
    }
  }

  assignPresetPower(item, nameOverride, pools, hasEdge = () => true) {
    const requested = nameOverride || item.system.arcane;
    const configured = pools.find(pool => normalizeName(pool.name) === normalizeName(requested) && hasEdge(pool.requires));
    const name = configured?.name || (validEntryName(requested) ? requested : "");
    const trait = configured?.trait || item.system.actions?.trait || "Spellcasting";
    const points = configured ? bounded(configured.points + Math.max(0, rankIndex(this.draft.rank)) * configured.growth, 0, 999)
      : Math.max(10, Number(item.system.pp) || 0);
    const entries = this.draft.spellcasting;
    const existing = Object.values(entries).find(entry => normalizeName(entry.name) === (normalizeName(name) || GENERAL_ENTRY));
    const entry = existing ?? addCastingEntry(entries, uid, {name, trait, points});
    if (!existing) this.presetCasting.add(entry.id);
    if (configured && this.presetCasting.has(entry.id)) Object.assign(entry, {trait, points, rule: configured.rule});
    this.draft.powerEntries[item._id] = entry.id;
  }

  syncAncestryPowers() {
    const {items, options, references} = this.ancestry ?? {};
    for (const item of items ?? []) if (item.type === "power" && !this.manualPowerEntries.has(item._id)) {
      this.assignPresetPower(item, ancestryGrantSettings(options, references.get(item._id)).casting, options.casting ?? []);
    }
  }

  async openArchetypes() {
    if (!game.user.isGM) return;
    if (this.archetypeEditor?.rendered) return this.archetypeEditor.bringToFront();
    this.archetypeEditor = new ArchetypeEditor(this.draft.role, [...this.catalog.values()].map(entry => entry.name).sort(), (key, use) =>
      use || key === this.draft.role ? this.selectArchetype(key) : this.render({parts: ["identity"]}));
    return this.archetypeEditor.render({force: true});
  }

  async refreshAncestryOptions() {
    const choices = await itemChoices("ancestry");
    this.ancestryOptions = Object.fromEntries(choices.map(row => [row.key, `${row.name} · ${row.detail}`]));
    if (this.rendered) await this.render({parts: ["identity"]});
  }

  async setAncestry(uuid, known) {
    const request = this.ancestryRequest = {};
    this.ancestryLoading = true;
    try {
      const item = uuid ? (known ?? await boundedRead(() => resolveItem(uuid, "ancestry"))) : null;
      const prepared = item ? await prepareAncestry(item) : null;
      if (request !== this.ancestryRequest) return;
      for (const grant of this.ancestry?.items ?? []) {
        delete this.draft.powerEntries[grant._id];
        this.manualPowerEntries.delete(grant._id);
      }
      this.ancestry = prepared;
      this.ancestryItem = item;
      this.draft.ancestry = uuid;
      if (prepared?.missing.length) ui.notifications.warn(`Unavailable ancestry grants: ${prepared.missing.join(", ")}.`);
      await this.syncLoadout();
      this.applyPreset();
    } finally {
      if (request === this.ancestryRequest) {
        this.ancestryLoading = false;
        if (this.rendered) await this.renderDraft();
      }
    }
  }

  async openAncestries() {
    if (!game.user.isGM) return;
    if (this.ancestryEditor?.rendered) return this.ancestryEditor.bringToFront();
    this.ancestryEditor = new AncestryEditor(this.ancestryItem, async (item, use) => {
      this.ancestryOptions[item.uuid] = `${item.name} · World items`;
      if (use || this.draft.ancestry === item.uuid) await this.setAncestry(item.uuid, item);
      else await this.render({parts: ["identity"]});
    });
    return this.ancestryEditor.render({force: true});
  }

  applyMovement(key) {
    const preset = namedMovement(key);
    if (!preset) return;
    const values = movementValues(preset);
    Object.assign(this.draft, values);
    for (const field of Object.keys(values)) this.edited.add(field);
    return this.renderDraft();
  }

  async editMovement(key) {
    if (!game.user.isGM) return;
    const preset = key ? namedMovement(key) : null;
    if (key && !preset) return;
    const data = preset ?? {...movementValues(this.draft), label: ""};
    const content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/npc-movement.hbs`,
      {data, modes: MOVEMENT_MODES, dice: DICE});
    const result = await DialogV2.prompt({classes: ["sbs-setting-dialog"], window: {title: preset ? "Edit movement preset" : "New movement preset"},
      content, rejectClose: false, ok: {label: "Save preset", callback: (_event, button) => Object.fromEntries(new FormData(button.form))}});
    if (!result) return;
    const label = result.label.trim();
    if (!label) throw new Error("Enter a name for the movement preset.");
    await saveMovement(key ?? uid(), {label, ...movementValues(result)});
    this.applyPreset();
    return this.renderDraft();
  }

  async removeMovement(key) {
    if (!game.user.isGM || !namedMovement(key)) return;
    if (!await DialogV2.confirm({window: {title: "Delete movement preset?"}, content: "<p>Remove this preset from the world library?</p>", rejectClose: false})) return;
    await removeMovement(key);
    this.applyPreset();
    return this.renderDraft();
  }

  async load() {
    const library = await librarySkills().catch(error => {
      console.warn(`${MODULE_ID} | NPC Builder is using standard skills`, error);
      return [];
    });
    this.catalog = new Map(library.map(item => [item.system.swid || slug(item.name), {name: item.name, item}]));
    for (const [name, attribute] of STANDARD_SKILLS) {
      if (!this.catalog.has(slug(name))) this.catalog.set(slug(name), {name, attribute});
    }
    this.applyPreset();
    await this.syncLoadout();
    await this.render({force: true});
    void this.refreshAncestryOptions().catch(report);
    return this;
  }

  applyPreset() {
    const {role, rank, focus} = this.draft;
    const profile = this.archetype;
    const {skills, attributes, ...fields} = makePreset(role, rank, focus, this.edited.has("mode") ? this.draft.mode : undefined, this.draft.wildcard, profile);
    const movement = profile.movement && namedMovement(profile.movement);
    if (movement) Object.assign(fields, movementValues(movement));
    fields.size = bounded(fields.size + (this.ancestry?.size ?? 0), -4, 20);
    for (const [key, value] of Object.entries(fields)) if (!this.edited.has(key)) this.draft[key] = value;
    if (this.draft.size === -4 && this.draft.mode === "melee" && !this.edited.has("damage")) this.draft.damage = "1";
    const oldEntry = this.draft.spellcasting[this.signaturePresetEntry];
    if (this.draft.mode === "power" && oldEntry && this.draft.signatureEntry === oldEntry.id && oldEntry.trait !== this.draft.trait) {
      if (!Object.values(this.draft.powerEntries).includes(oldEntry.id)) delete this.draft.spellcasting[oldEntry.id];
      this.draft.signatureEntry = null;
    }
    if (this.draft.mode === "power" && !this.draft.spellcasting[this.draft.signatureEntry]) {
      const trait = this.draft.trait || "Spellcasting";
      const pool = profile.casting?.find(entry => !entry.requires && normalizeName(entry.trait) === normalizeName(trait));
      const name = pool?.name || trait;
      const known = Object.values(this.draft.spellcasting).some(entry => normalizeName(entry.name) === normalizeName(name));
      const entry = addCastingEntry(this.draft.spellcasting, uid, {name, trait, points: pool ? pool.points + Math.max(0, rankIndex(rank)) * pool.growth : 10});
      if (pool && !known) entry.rule = pool.rule;
      this.draft.signatureEntry = entry.id;
      this.signaturePresetEntry = known ? null : this.draft.signatureEntry;
    }
    const limit = (key, die, shiftDie = true) => limitAncestryDie(die, this.ancestry?.options.ranges?.[key],
      this.ancestry?.options.anomalyChance ?? 0, this.variantSeed, key, shiftDie);
    for (const key of ATTRIBUTES) attributes[key] = limit(key, attributes[key]);
    const weights = Object.fromEntries(Object.entries(profile.attributeWeights ?? {}).filter(([key]) => !this.edited.has(`attributes.${key}.sides`)));
    const weighted = spendAttributeSteps(attributes, weights, (profile.weightedSteps ?? 0) * Math.max(0, rankIndex(rank)),
      this.variantSeed, (key, die) => limit(key, die, false));
    weighted.strength = sizeStrength(this.draft.size, weighted.strength);
    this.draft.attributes ??= weighted;
    for (const [key, die] of Object.entries(weighted)) for (const [field, value] of Object.entries(die)) {
      if (!this.edited.has(`attributes.${key}.${field}`)) this.draft.attributes[key][field] = value;
    }
    const defaults = new Map();
    if (this.draft.core) for (const [key, entry] of this.catalog) {
      if (entry.item?.system.isCoreSkill) {
        const die = entry.item.system.die;
        defaults.set(key, {name: entry.name, die: {...die, sides: Math.min(12, die.sides + 2 * Math.floor(rankIndex(rank) / 2))}});
      }
    }
    const features = [...this.features, ...this.ancestry?.items ?? []];
    const arcane = features.some(item => item.type === "edge" && item.system.isArcaneBackground || item.type === "ability" && item.system.grantsPowers);
    for (const [name, die] of Object.entries(skills)) {
      const key = slug(name);
      const settings = profile.skillOptions?.[key];
      if (name !== focus && settings && (settings.arcane && !arcane || variantRoll(this.variantSeed, `skill:${key}`) * 100 >= settings.chance)) continue;
      defaults.set(key, {name, die});
    }
    const traits = Object.values(this.draft.spellcasting).map(entry => entry.trait);
    if (["melee", "ranged"].includes(this.draft.mode)) traits.push(this.draft.trait);
    for (const item of features) if (item.type === "weapon") traits.push(item.system.actions?.trait);
    for (const name of traits) {
      if (!name || traitAttribute(name)) continue;
      const key = slug(name);
      if (key && !defaults.has(key)) defaults.set(key, {name, die: {sides: 6, modifier: 0}});
    }
    for (const [key, row] of this.skills) if (!row.custom && !defaults.has(key)) this.skills.delete(key);
    for (const [key, {name, die}] of defaults) {
      if (this.removed.has(key) || this.skills.get(key)?.custom) continue;
      const entry = this.catalog.get(key) ?? {name};
      this.setSkill(key, entry, die, false);
    }
  }

  setSkill(key, entry, die, custom) {
    const data = entry.item ? copyItem(entry.item) : {_id: uid(), name: entry.name, type: "skill",
      img: "systems/swade/assets/icons/skill.svg", system: {attribute: entry.attribute ?? "", swid: key}};
    data._id = this.skills.get(key)?.data._id ?? data._id;
    data.system.die = {sides: die.sides, modifier: die.modifier ?? 0};
    const linked = this.archetype.skillAttributes?.[key];
    if (linked) data.system.attribute = linked;
    this.skills.set(key, {key, name: data.name, data, custom});
  }

  get damageError() {
    const {mode, damage} = this.draft;
    return mode !== "none" && !(mode === "melee" && this.draft.size === -4) && damage && !Roll.validate(damage)
      ? "Enter a valid SWADE damage formula, such as @str+1d6 or 2d6." : "";
  }

  source({preview = false, extraPowers = [], entryId} = {}) {
    // Prepared documents own their own sources. Keep the draft isolated from system migrations and derived changes.
    const labels = attributeLabels();
    const nativeTrait = trait => labels[traitAttribute(trait)] ?? trait;
    const effects = game.modules.get(EFFECTS)?.api;
    const features = this.features.map(item => {
      if (item.type !== "weapon") return item;
      const system = {...item.system, actions: {...item.system.actions, trait: nativeTrait(item.system.actions?.trait ?? "")}};
      if (!this.attackTags.has(item._id)) return {...item, system};
      const tags = attackTags(this.attackTags.get(item._id), effects);
      return {...item, system, flags: {...item.flags, [EFFECTS]: {...item.flags?.[EFFECTS], tags}}};
    });
    const items = [...this.skills.values()].map(row => row.data).concat(features, extraPowers);
    if (this.ancestry) {
      items.push(this.ancestry.source);
      for (const grant of this.ancestry.items) {
        const existing = items.findIndex(item => item.type === grant.type && normalizeName(item.name) === normalizeName(grant.name));
        if (existing < 0) items.push(grant);
        else if (grant.type === "skill" && !this.skills.get(grant.system.swid)?.custom &&
          grant.system.die?.sides + 2 * (grant.system.die?.modifier ?? 0) >
          items[existing].system.die?.sides + 2 * (items[existing].system.die?.modifier ?? 0)) {
          const item = items[existing];
          items[existing] = {...item, system: {...item.system, die: grant.system.die}};
        }
      }
    }
    const spellcasting = Object.fromEntries(Object.entries(this.draft.spellcasting)
      .map(([id, entry]) => [id, {...entry, trait: nativeTrait(entry.trait)}]));
    const powerEntries = {...this.draft.powerEntries, ...Object.fromEntries(extraPowers.map(item => [item._id, entryId]))};
    const damage = preview && this.damageError ? "" : this.draft.damage;
    const draft = {...this.draft, spellcasting, powerEntries, trait: nativeTrait(this.draft.trait), damage,
      signatureTags: this.attackTags.get(SIGNATURE), ancestrySize: this.ancestry?.size, ancestryName: this.ancestry?.source.name,
      ancestrySizeWounds: this.ancestry?.options.sizeWounds,
      archetypeLabel: this.archetype.label, archetypeTag: ROLE_PROFILES[this.draft.role] ? this.draft.role : slug(this.archetype.label),
      archetypeTags: this.archetype.tags};
    return structuredClone(npcSource(draft, items, this.token, uid, effects));
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const draft = this.draft;
    const labels = attributeLabels();
    const actor = new CONFIG.Actor.documentClass(this.source({preview: true}));
    const estimate = estimateActor(actor);
    const {parry, toughness, armor, wounds} = estimate.profile;
    const attackRows = this.features.filter(item => item.type === "weapon").map(item => ({...item,
      details: attackDetails(item._id, {system: item.system, weapon: true, ranged: item.system.rangeType !== 0,
        tags: this.attackTagText(item._id)})}));
    const {shared, weapon, ranged} = draft.signatureOptions;
    const signatureDetails = attackDetails(SIGNATURE, {system: {...weapon, ...ranged, ...shared}, weapon: draft.mode !== "power",
      ranged: draft.mode === "ranged", tiny: draft.size === -4 && draft.mode === "melee", tags: this.attackTagText(SIGNATURE)});
    const castingEntries = Object.values(draft.spellcasting).map(entry => ({...entry, general: entry.id === GENERAL_ENTRY, usesPP: usesPP(entry),
      powers: [...this.features, ...(this.ancestry?.items ?? []).map(item => ({...item, inherited: true}))]
        .filter(item => item.type === "power" && draft.powerEntries[item._id] === entry.id),
      signature: draft.mode === "power" && draft.signatureEntry === entry.id && draft.damage ? draft.attackName : ""}));
    const entryChoices = Object.fromEntries(castingEntries.map(entry => [entry.id, entry.name]));
    const hasBetterPowers = !!game.modules.get(BETTER_POWERS)?.api?.usesNoPowerPoints;
    return {...ctx, draft, dice: DICE,
      archetypes: Object.fromEntries(Object.entries(archetypeLibrary()).map(([key, {label}]) => [key, label])),
      ancestryOptions: this.ancestryOptions, canManagePresets: game.user.isGM, ancestryLoading: this.ancestryLoading,
      ancestryGrants: this.ancestry?.items.map(item => item.name).join(", "),
      hasVariants: this.archetype.weightedSteps > 0 || this.archetype.loadout?.some(row => row.slot || row.chance < 100) ||
        Object.values(this.archetype.skillOptions ?? {}).some(row => row.chance < 100) || this.ancestry?.options.anomalyChance > 0,
      movementModes: MOVEMENT_MODES,
      ranks: Object.fromEntries(RANKS.map(rank => [rank, rank])), modes: MODES, weaponModes: WEAPON_MODES, labels, featureTypes: FEATURE_TYPES, featureType: this.featureType,
      disposition: {[-1]: "Hostile", 0: "Neutral", 1: "Friendly"},
      traitListId: `${this.id}-skills`, skillChoices: [...new Set([...Object.values(labels), ...[...this.catalog.values()].map(entry => entry.name)])].sort(),
      attributes: ATTRIBUTES.map(key => {
        const die = draft.attributes[key], effective = actor.system.attributes[key].die;
        const prepared = die.sides !== effective.sides || die.modifier !== effective.modifier;
        const modifier = effective.modifier > 0 ? `+${effective.modifier}` : effective.modifier || "";
        return {key, label: labels[key], ...die, fixed: key === "strength" && draft.size === -4,
          effective: prepared ? `d${effective.sides}${modifier}` : ""};
      }),
      skills: [...this.skills.values()].map(row => ({...row, ...row.data.system.die, attribute: row.data.system.attribute})).sort((a, b) => a.name.localeCompare(b.name)),
      features: this.features.filter(item => !["power", "weapon"].includes(item.type)).map(item => ({...item, typeLabel: FEATURE_TYPES[item.type]})),
      art: this.token.prototypeToken.texture?.src || actor.prototypeToken.texture.src || actor.img,
      power: draft.mode === "power", ranged: draft.mode === "ranged", hasAttack: draft.mode !== "none",
      castingEntries, castingRules: CASTING_RULES, hasBetterPowers, entryChoices, attackRows, signatureDetails,
      cr: draft.cr ?? (estimate.coverage === "Unrated" ? "" : estimate.cr), damageError: this.damageError,
      initiative: INITIATIVE.map(option => ({...option, checked: draft.initiative[option.key]})),
      tinyMelee: draft.size === -4 && draft.mode === "melee",
      defenses: {parry, toughness, armor}, wounds};
  }

  _preSyncPartState(partId, element, prior, state) {
    super._preSyncPartState(partId, element, prior, state);
    for (const details of element.querySelectorAll("details[data-section]")) {
      const previous = prior.querySelector(`details[data-section="${details.dataset.section}"]`);
      if (previous) details.open = previous.open;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const part of EDITOR_PARTS) {
      if (!options.parts.includes(part)) continue;
      for (const name of ["change", "input"]) this.parts[part].addEventListener(name, event => this.changeField(event).catch(report));
    }
  }

  async changeField(event) {
    const input = event.target;
    const {path, skill, field, attack, attackOption, attackFlags} = input.dataset;
    if (event.type === "input") {
      if (["name", "tags"].includes(path)) this.draft[path] = input.value;
      if (attackFlags) this.attackTags.set(attackFlags, input.value);
      return;
    }
    if (attackOption) return this.changeAttackOption(input, attack, attackOption);
    if (input.matches("[data-cr]")) {
      this.draft.cr = input.value === "" ? null : roundCR(bounded(Number(input.value), 0, 9999));
      return this.render({parts: ["identity"]});
    }
    if (input.dataset.defense) {
      const key = input.dataset.defense;
      if (input.value === "") delete this.draft.defenses[key];
      else if (Number.isFinite(input.valueAsNumber)) {
        const value = Math.trunc(input.valueAsNumber);
        this.draft.defenses[key] = key === "armor" ? Math.max(0, value) : value;
      }
      return this.render({parts: ["identity"]});
    }
    if (input.name === "featureType") { this.featureType = input.value; return; }
    if (path === "ancestry") return this.setAncestry(input.value);
    const {entry, entryField, powerEntry, attackField} = input.dataset;
    if (entry && entryField) {
      const row = this.draft.spellcasting[entry];
      const value = input.value.trim();
      if (entryField === "name") {
        const key = normalizeName(value);
        if (!validEntryName(value) || key === GENERAL_ENTRY || Object.values(this.draft.spellcasting)
          .some(other => other !== row && normalizeName(other.name) === key)) {
          input.value = row.name;
          throw new Error("Enter a unique spellcasting entry name without periods or brackets. General is reserved.");
        }
        row.name = value;
      } else if (entryField === "points") row.points = bounded(Math.trunc(Number(value)) || 0, 0, 999);
      else row[entryField] = value;
      if (entry === this.signaturePresetEntry) this.signaturePresetEntry = null;
      this.presetCasting.delete(entry);
      if (entryField === "trait") this.applyPreset();
      return this.renderDraft();
    }
    if (powerEntry) {
      this.manualPowerEntries.add(powerEntry);
      this.draft.powerEntries[powerEntry] = input.value;
      this.applyPreset();
      return this.renderDraft();
    }
    if (attack && attackField) {
      const item = this.features.find(item => item._id === attack);
      if (!item) return;
      const value = input.type === "number" || input.dataset.number !== undefined ?
        bounded(Math.trunc(Number(input.value)), Number(input.min || 0), Number(input.max || 2)) : input.value.trim();
      if (attackField === "system.damage" && value && !Roll.validate(value)) {
        input.value = item.system.damage;
        throw new Error("Enter a valid SWADE damage formula, such as @str+1d6 or 2d6.");
      }
      foundry.utils.setProperty(item, attackField, value);
      if (attackField === "system.actions.trait") this.applyPreset();
      return this.renderDraft();
    }
    if (skill && field) {
      const row = this.skills.get(skill);
      if (field === "attribute") row.data.system.attribute = input.value;
      else row.data.system.die[field] = bounded(Number(input.value), Number(input.min || 4), Number(input.max || 12));
      row.custom = true;
    } else if (path) {
      const {value} = input;
      const bounds = LIMITS[path] ?? [Number(input.min || -20), Number(input.max || 20)];
      const number = input.type === "number" || input.dataset.number !== undefined;
      let next = input.type === "checkbox" ? input.checked : number ? bounded(Math.trunc(Number(value)), ...bounds) : value;
      if (path === "damage") next = value.replace(/(?<!@)\bstr\b/gi, "@str").trim();
      if (path === "trait" || path === "initiative.follow") next = value.trim();
      if (number || path === "damage") input.value = next;
      if (path === "size") return this.setSize(next);
      foundry.utils.setProperty(this.draft, path, next);
      this.edited.add(path);
      if (path === "role") return this.selectArchetype(next);
      if (path === "rank") await this.syncLoadout();
      if (path === "focus") this.draft.focus = value.trim() || this.archetype.focus;
      if (["rank", "role", "focus", "core", "mode", "size", "wildcard", "signatureEntry", "trait"].includes(path)) this.applyPreset();
      if (["rank", "role", "focus", "mode", "core", "wildcard", "size", "signatureEntry", "signatureRof", "trait", "damage", "attackName"].includes(path)) return this.renderDraft();
    } else return;
    if (!["name", "tags"].includes(path)) return this.render({parts: ["identity"]});
  }

  async pickSize() {
    if (this.sizePicker?.rendered) return this.sizePicker.bringToFront();
    const picker = new DialogV2({
      classes: ["sbs-setting-dialog", "sbs-npc-size-picker"],
      window: {title: "Size Table", resizable: true},
      position: {width: 790, height: 565},
      content: "<div></div>",
      buttons: [{action: "dismiss", label: "Close"}]
    });
    this.sizePicker = picker;
    await picker.render({force: true});
    const content = renderSizeReference({selected: this.draft.size, select: size => {
      void picker.close().then(() => this.rendered && this.setSize(size)).catch(report);
    }});
    picker.element.querySelector(".dialog-content").replaceChildren(content);
    content.querySelector('[aria-current="true"]')?.scrollIntoView({block: "nearest"});
    return picker;
  }

  setSize(size) {
    if (Number.isFinite(this.draft.defenses.toughness)) this.draft.defenses.toughness += size - this.draft.size;
    this.draft.size = size;
    this.edited.add("size");
    this.applyPreset();
    return this.renderDraft();
  }

  async changeAttackOption(input, key, path) {
    const {shared, weapon, ranged} = this.draft.signatureOptions;
    const rangedField = ["shots", "currentShots", "ammo", "reloadType", "ppReloadCost"].includes(path);
    const sharedField = /^(bonusDamage|actions\.|templates\.)/.test(path);
    const system = key === SIGNATURE ? (sharedField ? shared : rangedField ? ranged : weapon)
      : this.features.find(item => item._id === key)?.system;
    if (!system) return;
    const numeric = input.type === "number" || input.hasAttribute("data-number");
    const value = input.type === "checkbox" ? input.checked : numeric
      ? bounded(Math.trunc(Number(input.value)), Number(input.min || 0), Number(input.max || 12))
      : input.value.trim();
    if (["actions.traitMod", "actions.dmgMod"].includes(path) && value && !Roll.validate(value)) {
      input.value = foundry.utils.getProperty(system, path) ?? "";
      throw new Error("Enter a valid SWADE modifier formula.");
    }
    if (path === "shots" || path === "currentShots") setMagazineField(system, path, value);
    else foundry.utils.setProperty(system, path, value);
    if (numeric) input.value = foundry.utils.getProperty(system, path);
    return this.render({parts: path === "shots" || path === "reloadType" ? ["build"] : ["identity"]});
  }

  async addCasting() {
    const entries = this.draft.spellcasting;
    const names = new Set(Object.values(entries).map(entry => normalizeName(entry.name)));
    let name = "Spellcasting";
    for (let suffix = 2; names.has(normalizeName(name)); suffix++) name = `Spellcasting ${suffix}`;
    addCastingEntry(entries, uid, {name, trait: "Spellcasting"});
    await this.renderDraft();
  }

  async removeCasting(id) {
    if ((this.draft.mode === "power" && this.draft.signatureEntry === id) || Object.values(this.draft.powerEntries).includes(id)) {
      ui.notifications.warn("Move the powers to another entry before removing this entry.");
      return;
    }
    delete this.draft.spellcasting[id];
    if (this.draft.signatureEntry === id) this.draft.signatureEntry = null;
    await this.renderDraft();
  }

  async pickSkill() {
    const choices = [...this.catalog].filter(([key]) => !this.skills.has(key)).map(([key, entry]) => ({key, name: entry.name, img: entry.item?.img}));
    choices.sort((a, b) => a.name.localeCompare(b.name));
    await this.openPicker("Choose a skill", choices, key => {
      const entry = this.catalog.get(key);
      this.removed.delete(key);
      this.setSkill(key, entry, entry.item?.system.die ?? {sides: 4}, true);
      return this.renderDraft();
    });
  }

  async pickTrait({path, entry, attack}) {
    const skills = new Map([...this.catalog].map(([key, skill]) => [key, {key, name: skill.name, img: skill.item?.img}]));
    for (const [key, skill] of this.skills) skills.set(key, {key, name: skill.name, img: skill.data.img});
    const choices = [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (entry) choices.unshift(...Object.entries(attributeLabels()).map(([key, name]) => ({key: `attribute:${key}`, name, detail: "Attribute"})));
    return this.openPicker(entry ? "Choose casting trait" : "Choose a skill", choices, (_key, {name}) => {
      if (entry) this.draft.spellcasting[entry].trait = name;
      else if (attack) this.features.find(item => item._id === attack).system.actions.trait = name;
      else {
        this.draft[path] = name;
        this.edited.add(path);
      }
      this.removed.delete(slug(name));
      this.applyPreset();
      return this.renderDraft();
    });
  }

  attackTagText(key) {
    const stored = this.features.find(item => item._id === key)?.flags?.[EFFECTS]?.tags ?? [];
    return this.attackTags.get(key) ?? [].concat(stored).join(", ");
  }

  async pickFlag(key) {
    const api = game.modules.get(EFFECTS)?.api;
    const saved = game.settings.settings.has(`${EFFECTS}.flagLibrary`) ? game.settings.get(EFFECTS, "flagLibrary") : [];
    const flags = game.modules.get("swade-better-templates")?.api?.flagCatalog?.() ?? saved;
    const current = attackTags(key ? this.attackTagText(key) : this.draft.tags, api);
    const reserved = key ? [] : attackTags([...RANKS, "wildcard", "extra"], api);
    const choices = attackTags(flags, api).filter(flag => !current.includes(flag) && !reserved.includes(flag))
      .map(flag => ({key: flag, name: flag}));
    return this.openPicker("Choose a Better Effects flag", choices, flag => {
      const tags = attackTags([...(key ? this.attackTagText(key) : this.draft.tags).split(","), flag], api).join(", ");
      if (key) this.attackTags.set(key, tags);
      else this.draft.tags = tags;
      return this.render({parts: [key ? "build" : "identity"]});
    });
  }

  async damageGuide(key) {
    const signature = key === SIGNATURE;
    const current = new CONFIG.Actor.documentClass(this.source({preview: true}));
    const item = current.items.get(key);
    if (!signature && !item) return;
    const mode = signature ? this.draft.mode : usesMelee(item) ? "melee" : "ranged";
    const choices = damageBenchmarks(this.draft.rank, mode, this.draft.size);
    if (!choices.length) return;
    const formula = await DialogV2.wait({
      classes: ["sbs-setting-dialog", "sbs-npc-damage-guide"],
      window: {title: `${this.draft.rank} Damage Guide`},
      position: {width: 460},
      rejectClose: false,
      content: "<p>Choose a base damage formula. AP is applied separately, up to the target’s Armor. It increases effectiveness against armored targets only.</p>",
      buttons: choices.map(({label, formula}, i) => ({action: `damage-${i}`, label: `${label}: ${formula}`, callback: () => formula}))
    });
    if (typeof formula !== "string" || !this.rendered) return;
    if (signature) {
      this.draft.damage = formula;
      this.edited.add("damage");
    } else {
      const attack = this.features.find(item => item._id === key);
      if (attack) attack.system.damage = formula;
    }
    return this.render({parts: ["identity", "build"]});
  }

  async openPicker(title, choices, onSelect, options = {}) {
    if (this.picker?.element?.isConnected) await this.picker.close();
    const picker = this.picker = new ChoicePicker({choices, pageSize: 100, window: {title}, onSelect, ...options});
    await picker.render({force: true});
    return picker;
  }

  async pickFeature(type, entryId) {
    const title = {power: "Choose a power", weapon: "Choose a weapon"}[type] ?? `Choose ${FEATURE_TYPES[type]?.toLowerCase()}`;
    const picker = await this.openPicker(title, [], async uuid => {
      const copy = copyItem(await resolveItem(uuid, type));
      if (["armor", "weapon", "shield"].includes(type)) copy.system.equipStatus = 3;
      if (entryId) {
        if (!this.draft.spellcasting[entryId]) throw new Error("That spellcasting entry was removed.");
        this.draft.powerEntries[copy._id] = entryId;
      }
      this.features.push(copy);
      if (type === "edge") await this.syncOptions();
      else {
        if (type === "weapon" || type === "power") this.applyPreset();
        await this.renderDraft();
      }
    }, {loading: true, onPreview: async uuid => (await resolveItem(uuid, type)).sheet.render({force: true})});
    const choices = await itemChoices(type);
    if (this.picker !== picker || !picker.element?.isConnected) return;
    if (type === "edge") picker.categories = Object.fromEntries([...new Map(choices.map(({category, label}) => [category, label]))]
      .sort((a, b) => a[1].localeCompare(b[1])));
    picker.entries = choices;
    picker.loading = false;
    await picker.render();
  }

  async addAttack() {
    const {size, rank} = this.draft;
    const suggestions = damageBenchmarks(rank, "melee", size);
    this.features.push({_id: uid(), name: "New attack", type: "weapon", img: "systems/swade/assets/icons/weapon.svg",
      system: {damage: (suggestions[1] ?? suggestions[0]).formula, ap: 0, equipStatus: 3, rangeType: 0, range: "", rof: 1, weight: 0,
        ...(size === -4 ? {bonusDamageDice: 0} : {}), actions: {trait: "Fighting"}}});
    this.applyPreset();
    await this.renderDraft();
  }

  async pickEffect() {
    const api = game.modules.get(EFFECTS)?.api;
    const picker = await this.openPicker("Choose an actor effect", [], async reference => {
      let effects;
      if (reference.startsWith("status:")) effects = [await CONFIG.ActiveEffect.documentClass.fromStatusEffect(reference.slice(7))];
      else {
        const doc = await foundry.utils.fromUuid(reference);
        if (!doc?.testUserPermission(game.user, "LIMITED")) throw new Error("This effect is no longer available.");
        effects = doc.documentName === "ActiveEffect" ? [doc] : doc.type === EFFECT_TEMPLATE ? [...doc.effects] : [];
      }
      if (!effects.length) throw new Error("The selected source contains no effects.");
      for (const effect of effects) {
        const source = effect.toObject();
        delete source._stats;
        this.draft.effects.push({...source, _id: uid(), transfer: false, start: null,
          origin: reference.startsWith("status:") ? null : reference, duration: {...source.duration, expired: false}});
      }
      await this.renderDraft();
    }, {loading: true});
    const statuses = CONFIG.statusEffects.map(effect => ({value: `status:${effect.id}`, name: game.i18n.localize(effect.name ?? effect.label), img: effect.img ?? effect.icon, group: "SWADE conditions"}));
    let choices = statuses;
    if (api?.effectCatalog) {
      try { choices = await boundedRead(() => api.effectCatalog()); }
      catch (error) { picker.notice = "Only SWADE conditions are available because the effect library did not respond."; }
    }
    if (this.picker !== picker || !picker.element?.isConnected) return;
    picker.entries = choices.map(({value: key, name, img, group: detail}) => ({key, name, img, detail}));
    picker.loading = false;
    await picker.render();
  }

  async generatePowers(entryId) {
    const entry = this.draft.spellcasting[entryId];
    if (!entry || this.generating) return;
    const tier = Math.max(0, rankIndex(this.draft.rank));
    const count = 2 + Math.floor(tier / 2) + Number(this.draft.wildcard);
    const options = Object.entries(POWER_THEMES).map(([key, name]) => `<option value="${key}">${name}</option>`).join("");
    const request = await DialogV2.prompt({classes: ["sbs-setting-dialog"], window: {title: "Generate Powers"}, rejectClose: false,
      content: `<label>Theme<select name="theme">${options}</select></label>
        <label>Number of powers<input name="count" type="number" min="1" max="6" step="1" value="${count}"></label>`,
      ok: {label: "Generate", callback: (_event, button) => Object.fromEntries(new FormData(button.form))}});
    if (!request || this.generating || !this.draft.spellcasting[entryId]) return;
    this.generating = true;
    try {
      await this.selectGeneratedPowers(entry, request);
    } finally { this.generating = false; }
  }

  async selectGeneratedPowers(entry, {theme, count}) {
    const Actor = CONFIG.Actor.documentClass;
    const draft = this.draft;
    const indexed = await itemChoices("power", {generate: true});
    if (!this.element?.isConnected || !draft.spellcasting[entry.id]) return;
    const actor = new Actor(this.source({preview: true}));
    const baseline = estimateActor(actor);
    const tier = Math.max(0, rankIndex(draft.rank));
    const rankBudget = advancementStrength(tier * 4, baseline.woundCap) / (draft.wildcard ? 1 : 4);
    const ceiling = Math.max(baseline.strength, draft.cr === null
      ? Math.max(rankBudget, baseline.strength * 1.2) : advancementStrength(draft.cr, baseline.woundCap));
    const trait = actorTrait(actor, findAttackTrait(actor, entry.trait));
    const spendPP = usesPP(entry);
    const canCast = cost => spendPP ? cost <= entry.points : traitAtLeast(trait, 4 + Math.ceil(cost / 2)) >= (draft.wildcard ? .45 : .25);
    const existing = this.features.filter(item => item.type === "power");
    if (draft.mode === "power" && draft.damage) existing.push({name: draft.attackName});
    const criteria = {rank: draft.rank, theme, existing, canCast};
    const candidates = powerCandidates(indexed, criteria);
    const attacks = candidates.filter(item => !!item.system.damage);
    const support = candidates.filter(item => !item.system.damage);
    const limit = bounded(Math.trunc(Number(count)) || 1, 1, 6);
    const selected = [];
    const examined = Math.min(30, candidates.length);
    for (let i = 0; i < examined && selected.length < limit; i++) {
      const first = selected.length % 2 ? support : attacks;
      const pool = first.length ? first : first === support ? attacks : support;
      const [choice] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      let item;
      try { item = copyItem(await boundedRead(() => resolveItem(choice.key, "power"))); }
      catch (error) { console.warn(`${MODULE_ID} | Could not read power ${choice.key}`, error); continue; }
      if (!this.element?.isConnected || !draft.spellcasting[entry.id]) return;
      if (!powerCandidates([item], criteria).length) continue;
      if (item.system.damage) {
        const preview = new Actor(this.source({preview: true, extraPowers: [...selected, item], entryId: entry.id}));
        const rating = estimateActor(preview);
        if (rating.strength > ceiling || !rating.profile.attacks.some(attack => attack.name === item.name && attack.mode === "power")) continue;
      }
      selected.push(item);
    }
    const present = new Set(this.features.filter(item => item.type === "power").map(powerKey));
    const added = selected.filter(item => !present.has(powerKey(item)));
    if (!added.length) return ui.notifications.info("No matching powers fit this entry’s rank, casting limits and combat rating.");
    for (const item of added) {
      draft.powerEntries[item._id] = entry.id;
      this.features.push(item);
    }
    this.applyPreset();
    if (added.length < limit) ui.notifications.info(`Added ${added.length} of ${limit} requested powers that fit this entry.`);
    return this.renderDraft();
  }

  addNewFeature() { return this.editFeature(this.featureType); }

  openFeature(id) {
    const item = this.features.find(feature => feature._id === id);
    const effect = this.draft.effects.find(effect => effect._id === id);
    if (item || effect) return this.editFeature(item?.type ?? "effect", item ?? effect);
  }

  async editFeature(type, original) {
    if (this.featureEditor?.rendered) return this.featureEditor.bringToFront();
    if (this.openingFeature) return;
    this.openingFeature = true;
    try {
      this.featureEditor = await openNPCFeatureDraft(type, async source => {
        const data = skillData(source);
        data._id = original?._id ?? uid();
        if (original?._stats) data._stats = original._stats;
        const list = type === "effect" ? this.draft.effects : this.features;
        if (type === "effect") Object.assign(data, {start: null, origin: original?.origin ?? null, transfer: false});
        else {
          data.system.swid ||= slug(data.name);
        }
        if (original) {
          const index = list.indexOf(original);
          if (index < 0) return;
          list[index] = data;
        } else list.push(data);
        if (type === "edge") await this.syncOptions();
        else {
          if (type === "power" || type === "weapon") this.applyPreset();
          await this.renderDraft();
        }
      }, original);
    } finally {
      this.openingFeature = false;
    }
  }

  async pickArt(shift) {
    const modern = game.modules.get("tokenizer-2")?.api;
    const legacy = game.modules.get("vtta-tokenizer")?.api;
    const name = this.draft.name.trim() || "New NPC";
    const src = this.token.prototypeToken.texture?.src || this.token.img || CONFIG.Actor.documentClass.DEFAULT_ICON;
    if (!shift && modern?.openEditorStandalone) {
      const art = await modern.openEditorStandalone({name, type: "npc", sourceImage: src, disposition: this.draft.disposition,
        ...this.token.flags?.["tokenizer-2"]});
      if (!art || !this.rendered) return;
      const update = foundry.utils.expandObject(art.prototypeToken ?? {});
      this.token.prototypeToken = update.prototypeToken ?? (art.tokenPath ? {texture: {src: art.tokenPath}} : this.token.prototypeToken);
      if (art.avatarPath) this.token.img = art.avatarPath;
      this.token.flags = {"tokenizer-2": {layerStack: art.layerStack, avatarLayerStack: art.avatarLayerStack}};
      return this.renderDraft();
    }
    const set = (path, avatar) => {
      if (!path || !this.rendered) return;
      this.token = {prototypeToken: {texture: {src: path}, randomImg: false}, img: avatar ?? this.token.img};
      void this.renderDraft().catch(report);
    };
    if (!shift && legacy?.launch) return legacy.launch({name, type: "npc", disposition: this.draft.disposition,
      tokenFilename: src, avatarFilename: this.token.img || src}, response => set(response?.tokenFilename, response?.avatarFilename));
    return new foundry.applications.apps.FilePicker.implementation({type: "imagevideo", current: src, callback: path => set(path)}).render({force: true});
  }

  async create() {
    if (this.creating) return;
    if (!this.draft.name.trim()) throw new Error("Enter a name for the NPC.");
    if (this.damageError) throw new Error(this.damageError);
    if (this.ancestryLoading || this.loadoutLoading) throw new Error("Wait for the ancestry and archetype items to finish loading.");
    if (!CONFIG.Actor.documentClass.canUserCreate(game.user)) throw new Error("You do not have permission to create actors.");
    this.creating = true;
    try {
      const source = this.source();
      const notes = await ancestryTableNotes(this.ancestry?.options.tables);
      if (notes) source.system.details.biography = {value: notes};
      const actor = await CONFIG.Actor.documentClass.create(source, {renderSheet: true, keepEmbeddedIds: true});
      if (actor) await this.close();
      return actor;
    } finally { this.creating = false; }
  }

  async _onClose(options) {
    await this.archetypeEditor?.close();
    await this.ancestryEditor?.close();
    await this.movementTable?.close();
    await this.sizePicker?.close();
    await this.featureEditor?.close();
    await this.picker?.close();
    await super._onClose(options);
  }
}

export function openNPCBuilder({folder} = {}) {
  if (!CONFIG.Actor.documentClass.canUserCreate(game.user)) return;
  return new NPCBuilder(folder).load().catch(report);
}

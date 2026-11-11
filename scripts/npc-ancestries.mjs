import {MODULE_ID, skillData, slug} from "./skills.mjs";
import {ATTRIBUTES, bounded} from "./npc-math.mjs";
import {copyItem, draggedLibraryItem, itemCategories, itemChoices, resolveItem, tableChoices} from "./npc-catalog.mjs";
import {librarySkills} from "./library.mjs";
import {ChoicePicker} from "./picker.mjs";
import {boundedRead} from "./bestiary-catalog.mjs";
import {MOVEMENT_MODES, syncPresetSections} from "./npc-presets.mjs";
import {EFFECTS, attackTags} from "./npc-data.mjs";
import {CASTING_RULES, readCasting} from "./npc-forge-options.mjs";
import {validEntryName} from "./npc-casting.mjs";
import {renderSizeReference} from "./npc-size.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const ANCESTRY_FLAG = "ancestralTrait";
const FORGE = "ancestryForge";
const DICE = {4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12"};
const GRANT_TYPES = {ability: "Abilities", edge: "Edges", hindrance: "Hindrances", skill: "Skills",
  gear: "Gear", weapon: "Weapons", armor: "Armor", shield: "Shields", power: "Powers", action: "Actions"};
const CHANGES = {text: "Description only", size: "Size", wounds: "Wounds", parry: "Parry", toughness: "Toughness",
  ground: "Walk", fly: "Fly", swim: "Swim", burrow: "Burrow", movementMode: "Default movement mode",
  runningDie: "Running die", runMod: "Running modifier", hardy: "Hardy",
  animal: "Animal Smarts", fatigue: "Maximum Fatigue", fatigueIgnored: "Ignore Fatigue", woundsIgnored: "Ignore Wounds",
  bennies: "Maximum Bennies", recover: "Unshake bonus", soak: "Soak bonus",
  ...Object.fromEntries(ATTRIBUTES.map(name => [name, `${name[0].toUpperCase() + name.slice(1)} die steps`]))};
const KEYS = {size: "system.stats.size", wounds: "system.wounds.max", parry: "system.stats.parry.value",
  toughness: "system.stats.toughness.value", ground: "system.pace.ground", fly: "system.pace.fly", swim: "system.pace.swim",
  burrow: "system.pace.burrow", movementMode: "system.pace.base", runningDie: "system.pace.running.die",
  runMod: "system.pace.running.mod", hardy: "flags.swade.hardy", animal: "system.attributes.smarts.animal",
  fatigue: "system.fatigue.max", fatigueIgnored: "system.fatigue.ignored", woundsIgnored: "system.wounds.ignored",
  bennies: "system.bennies.max", recover: "system.attributes.spirit.unShakeBonus", soak: "system.attributes.vigor.soakBonus"};
const id = () => foundry.utils.randomID();
const report = error => ui.notifications.error(error.message);
const grantKey = uuid => uuid.replaceAll(".", ":");
const storedGrant = (rows, uuid) => rows && uuid ? rows[grantKey(uuid)] ?? rows[uuid] ?? foundry.utils.getProperty(rows, uuid) : undefined;
export const ancestryGrantSettings = (options, uuid) => storedGrant(options.grants, uuid) ?? {};

export function ancestryTraitEffect(trait) {
  const isAttribute = ATTRIBUTES.includes(trait.kind);
  const key = isAttribute ? `system.attributes.${trait.kind}.die.sides` : KEYS[trait.kind];
  const change = ["hardy", "animal"].includes(trait.kind) ? {key, type: "override", value: "true"}
    : trait.kind === "movementMode" ? {key, type: "override", value: Object.hasOwn(MOVEMENT_MODES, trait.amount) ? trait.amount : "ground"}
    : trait.kind === "runningDie" ? {key, type: "override", value: Object.hasOwn(DICE, trait.amount) ? String(trait.amount) : "6"}
    : {key, type: "add", value: String(trait.amount * (isAttribute ? 2 : 1))};
  return {_id: trait.id, name: trait.name, img: "systems/swade/assets/icons/ability.svg", description: trait.description,
    type: "base", transfer: true, system: {changes: key ? [change] : []},
    flags: {[MODULE_ID]: {[ANCESTRY_FLAG]: {kind: trait.kind, amount: trait.amount, points: trait.points}}}};
}

// Actor.create receives its items as one source. Expand grants in the draft so
// preview, rating, and creation all see the same skills, equipment, and effects.
export async function prepareAncestry(ancestry) {
  async function applyChoices(document, data) {
    if (!data.system.choiceSets?.some(set => set.choice === null)) return data;
    const choices = await document.handleChoices(data);
    return foundry.utils.mergeObject(data, foundry.utils.expandObject(choices));
  }
  const source = await applyChoices(ancestry, copyItem(ancestry));
  const items = [];
  const references = new Map();
  const missing = [];
  const visited = new Set([ancestry.uuid]);
  async function visit(parent) {
    const children = [];
    const grants = parent.system.grants ?? [];
    const resolved = await Promise.all(grants.map(async grant => {
      if (!grant.uuid || visited.has(grant.uuid)) return null;
      visited.add(grant.uuid);
      try {
        const doc = await boundedRead(() => foundry.utils.fromUuid(grant.uuid));
        if (doc?.documentName === "Item" && doc.visible && doc.type !== "ancestry") return {doc, grant};
      } catch (error) { console.warn(`${MODULE_ID} | Ancestry grant`, error); }
      missing.push(grant.name || grant.uuid);
      return null;
    }));
    for (const entry of resolved.filter(Boolean)) {
      const data = await applyChoices(entry.doc,
        foundry.utils.mergeObject(copyItem(entry.doc), foundry.utils.expandObject(entry.grant.mutation ?? {}), {inplace: false}));
      items.push(data);
      references.set(data._id, entry.grant.uuid);
      children.push(data._id);
      await visit(data);
    }
    parent.flags ??= {};
    parent.flags.swade = {...parent.flags.swade, hasGranted: children};
  }
  await visit(source);
  const probe = new CONFIG.Actor.documentClass({name: source.name, type: "npc", system: {stats: {size: 0}},
    items: structuredClone([source, ...items])});
  return {source, items, references, missing, size: probe.system.stats.size, options: source.flags?.[MODULE_ID]?.[FORGE] ?? {}};
}

export async function ancestryTableNotes(entries) {
  const results = [];
  for (const entry of entries ?? []) {
    try {
      const table = await boundedRead(() => foundry.utils.fromUuid(entry.uuid));
      if (table?.documentName !== "RollTable" || !table.visible) throw new Error("The roll table is unavailable.");
      const rolls = [];
      for (let i = 0; i < entry.count; i++) {
        const draw = await table.roll();
        rolls.push(...draw.results.map(result => result.description || foundry.utils.escapeHTML(result.name || result.documentUuid || "")));
      }
      if (rolls.length) results.push(`<h3>${foundry.utils.escapeHTML(table.name)}</h3><ul>${rolls.map(text => `<li>${text}</li>`).join("")}</ul>`);
    } catch (error) { ui.notifications.warn(`Ancestry table ${entry.name}: ${error.message}`); }
  }
  return results.join("");
}

export class AncestryEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form", classes: ["sbs-setting-dialog", "sbs-npc-preset-editor", "sbs-ancestry-editor"],
    window: {title: "Ancestry Builder", icon: "fa-solid fa-people-group", resizable: true},
    position: {width: 810, height: 640},
    actions: {
      new: function () { return this.switchTo().catch(report); },
      load: function () { return this.chooseAncestry().catch(report); },
      art: function () { return this.pickArt(); },
      addTrait: function () {
        this.capture();
        this.draft.traits.push({id: id(), name: "", kind: "text", amount: 1, points: 0, description: ""});
        this.dirty = true;
        return this.render();
      },
      removeTrait: function (_event, control) { this.capture(); this.draft.traits.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render(); },
      addGrant: function (_event, control) { return this.addGrant(control.dataset.type).catch(report); },
      addCore: function () { return this.addCoreSkills().catch(report); },
      pickTrait: function (_event, control) { return this.pickTrait(control.dataset.input).catch(report); },
      pickSize: function (_event, control) { return this.pickSize(Number(control.dataset.index)).catch(report); },
      addCasting: function () {
        this.capture(); this.draft.casting.push({name: "", trait: "Spellcasting", points: 10, growth: 0, rule: "inherit"});
        this.dirty = true; return this.render();
      },
      removeCasting: function (_event, control) {
        this.capture(); this.draft.casting.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render();
      },
      addTable: function () { return this.addTable().catch(report); },
      removeTable: function (_event, control) {
        this.capture(); this.draft.tables.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render();
      },
      removeGrant: function (_event, control) { this.capture(); this.draft.grants.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render(); },
      save: function () { return this.save(false).catch(report); },
      use: function () { return this.save(true).catch(report); }
    }
  };
  static PARTS = {editor: {template: `modules/${MODULE_ID}/templates/npc-ancestries.hbs`,
    templates: [`modules/${MODULE_ID}/templates/npc-forge-casting.hbs`], scrollable: [".sbs-preset-form"]}};

  constructor(item, onSave) {
    super();
    this.onSave = onSave;
    this.grantType = "ability";
    this.load(item);
  }

  load(item) {
    this.item = item;
    const source = item?.toObject();
    const points = source?.flags?.[MODULE_ID]?.ancestryGrantPoints ?? {};
    const options = source?.flags?.[MODULE_ID]?.[FORGE] ?? {};
    const traits = (source?.effects ?? []).filter(effect => effect.flags?.[MODULE_ID]?.[ANCESTRY_FLAG])
      .map(effect => ({id: effect._id, name: effect.name, description: effect.description, ...effect.flags[MODULE_ID][ANCESTRY_FLAG]}));
    this.draft = {name: source?.name ?? "", img: source?.img ?? "systems/swade/assets/icons/ancestry.svg",
      source: source?.system.source ?? "", description: source?.system.description ?? "",
      tags: [].concat(source?.flags?.[EFFECTS]?.tags ?? []).join(", "),
      threshold: source?.system.threshold ?? 2, traits, ranges: options.ranges ?? {}, anomalyChance: options.anomalyChance ?? 0,
      sizeWounds: options.sizeWounds !== false, casting: options.casting ?? [], tables: options.tables ?? [],
      grants: (source?.system.grants ?? []).map(grant => {
        const stored = ancestryGrantSettings(options, grant.uuid);
        const document = foundry.utils.fromUuidSync(grant.uuid, {strict: false});
        return {...grant, ...stored, type: stored.type ?? document?.type, points: storedGrant(points, grant.uuid) ?? 0,
          baseMutation: structuredClone(stored.baseMutation ?? grant.mutation ?? {})};
      })};
    this.dirty = false;
  }

  capture() {
    if (!this.element?.querySelector("[name=ancestryName]")) return;
    const values = new FormData(this.element);
    const read = key => String(values.get(key) ?? "").trim();
    const num = key => bounded(Math.trunc(Number(read(key))) || 0, -100, 100);
    const draft = this.draft;
    draft.name = read("ancestryName");
    draft.source = read("source");
    draft.description = read("description");
    draft.tags = read("tags");
    draft.threshold = num("threshold");
    draft.anomalyChance = bounded(num("anomalyChance"), 0, 100);
    draft.sizeWounds = values.has("sizeWounds");
    draft.ranges = Object.fromEntries(ATTRIBUTES.map(key => [key, {
      min: num(`range-min-${key}`), max: num(`range-max-${key}`), anomaly: bounded(num(`range-anomaly-${key}`), 0, 4)
    }]));
    draft.traits = draft.traits.map((trait, i) => {
      const kind = read(`trait-kind-${i}`);
      const value = `trait-value-${i}`;
      return {...trait, name: read(`trait-name-${i}`), kind, amount: kind === "movementMode" ? read(value) : num(value),
        points: num(`trait-points-${i}`), description: read(`trait-description-${i}`)};
    });
    draft.grants = draft.grants.map((grant, i) => ({...grant, points: num(`grant-points-${i}`),
      sides: num(`grant-die-${i}`), modifier: num(`grant-mod-${i}`), casting: read(`grant-casting-${i}`),
      damage: read(`grant-damage-${i}`), ap: read(`grant-ap-${i}`), attackTrait: read(`grant-trait-${i}`), range: read(`grant-range-${i}`)}));
    draft.casting = readCasting(values, draft.casting);
    draft.tables = draft.tables.map((table, i) => ({...table, count: bounded(num(`table-count-${i}`), 1, 5)}));
  }

  async _prepareContext() {
    const groups = [
      {key: "skill", label: "Starting skills"}, {key: "edge", label: "Edges"}, {key: "hindrance", label: "Hindrances"},
      {key: "power", label: "Powers"}, {key: "weapon", label: "Natural weapons"}, {key: "other", label: "Other grants"}
    ];
    const other = type => !groups.some(group => group.key === type);
    for (const group of groups) group.rows = this.draft.grants.map((grant, index) => ({...grant, index})).filter(grant =>
      group.key === "other" ? other(grant.type) : grant.type === group.key);
    return {draft: this.draft, pointTotal: this.pointTotal, kinds: CHANGES, types: GRANT_TYPES, grantType: this.grantType, canUse: !!this.onSave,
      dice: DICE, groups, castingRules: CASTING_RULES, movementModes: MOVEMENT_MODES,
      attributes: ATTRIBUTES.map(key => ({key, name: game.i18n.localize(CONFIG.SWADE.attributes[key].long), ...this.draft.ranges[key]})),
      libraryCopy: this.item?.inCompendium || (this.item && !this.item.isOwner),
      otherEffects: this.item?.effects.filter(effect => !effect.getFlag(MODULE_ID, ANCESTRY_FLAG)) ?? []};
  }

  get pointTotal() { return [...this.draft.traits, ...this.draft.grants].reduce((sum, row) => sum + row.points, 0); }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.parts.editor;
    root.ondragover = event => { if (event.target.closest("[data-grant-drop]")) event.preventDefault(); };
    root.ondrop = event => {
      if (!event.target.closest("[data-grant-drop]")) return;
      event.preventDefault();
      void draggedLibraryItem(event).then(entry => { if (entry && Object.hasOwn(GRANT_TYPES, entry.type)) return this.addGrantEntry(entry); }).catch(report);
    };
    root.oninput = event => {
      if (event.target.name === "grantType") { this.grantType = event.target.value; return; }
      this.dirty = true;
      this.capture();
      const label = this.parts.editor.querySelector("[data-ancestry-total]");
      label.textContent = `${this.pointTotal} / ${this.draft.threshold} points`;
      label.classList.toggle("sbs-preset-unbalanced", this.pointTotal !== this.draft.threshold);
    };
    root.onchange = event => {
      if (event.target.name?.startsWith("trait-kind-")) this.render();
    };
  }

  _preSyncPartState(part, next, prior, state) {
    super._preSyncPartState(part, next, prior, state);
    syncPresetSections(next, prior);
  }

  async switchTo(item) {
    if (this.dirty && !await DialogV2.confirm({window: {title: "Discard unsaved changes?"}, content: "<p>Switch ancestries and discard the current edits?</p>", rejectClose: false})) return;
    this.load(item);
    return this.render();
  }

  async chooseAncestry() { return this.pick("ancestry", uuid => resolveItem(uuid, "ancestry").then(item => this.switchTo(item))); }

  async pick(type, onSelect) {
    await this.picker?.close();
    const picker = this.picker = new ChoicePicker({choices: [], loading: true, pageSize: 100,
      window: {title: `Choose ${GRANT_TYPES[type]?.toLowerCase() ?? "an ancestry"}`}, onSelect,
      onPreview: async uuid => (await resolveItem(uuid, type)).sheet.render({force: true})});
    await picker.render({force: true});
    const choices = await itemChoices(type);
    if (picker.rendered) {
      picker.categories = itemCategories(choices);
      picker.entries = choices; picker.loading = false; await picker.render();
    }
  }

  async addGrant(type) {
    this.capture();
    type ||= this.element.querySelector("[name=grantType]").value;
    const draft = this.draft;
    return this.pick(type, (uuid, entry) => {
      if (this.draft === draft) return this.addGrantEntry({...entry, key: uuid, type});
    });
  }

  addGrantEntry(entry) {
    if (this.draft.grants.some(grant => grant.uuid === entry.key)) return;
    this.capture();
    this.draft.grants.push({uuid: entry.key, name: entry.name, img: entry.img, type: entry.type, points: 0,
      sides: entry.sides ?? 0, modifier: entry.modifier ?? 0, baseMutation: {}});
    this.dirty = true;
    return this.render();
  }

  async addCoreSkills() {
    const core = (await librarySkills()).filter(item => item.system.isCoreSkill);
    this.capture();
    const existing = new Set(this.draft.grants.map(grant => grant.uuid));
    for (const skill of core) if (!existing.has(skill.uuid)) this.draft.grants.push({uuid: skill.uuid, name: skill.name,
      img: skill.img, type: "skill", points: 0, sides: skill.system.die.sides, modifier: skill.system.die.modifier, baseMutation: {}});
    this.dirty = true;
    return this.render();
  }

  async pickTrait(name) {
    const skills = await librarySkills();
    const choices = [...skills.map(item => ({key: item.name, name: item.name, img: item.img, detail: "Skill"})),
      ...ATTRIBUTES.map(key => {
        const label = game.i18n.localize(CONFIG.SWADE.attributes[key].long);
        return {key: label, name: label, detail: "Attribute"};
      })];
    await this.picker?.close();
    this.picker = new ChoicePicker({choices, window: {title: "Choose a trait"}, onSelect: value => {
      const input = this.element.querySelector(`[name="${name}"]`);
      if (input) { input.value = value; input.dispatchEvent(new Event("input", {bubbles: true})); }
    }});
    return this.picker.render({force: true});
  }

  async pickSize(index) {
    this.capture();
    const trait = this.draft.traits[index];
    if (!trait) return;
    await this.sizePicker?.close();
    const picker = this.sizePicker = new DialogV2({
      classes: ["sbs-setting-dialog", "sbs-npc-size-picker"], position: {width: 790, height: 565},
      window: {title: "Size Table", resizable: true}, content: "<div></div>", buttons: [{action: "dismiss", label: "Close"}]
    });
    await picker.render({force: true});
    picker.element.querySelector(".dialog-content").replaceChildren(renderSizeReference({selected: trait.amount, select: async size => {
      const row = this.draft.traits.find(row => row.id === trait.id);
      if (row?.kind === "size") {
        row.amount = size; this.dirty = true; await this.render();
      }
      await picker.close();
    }}));
  }

  async addTable() {
    this.capture();
    await this.picker?.close();
    const draft = this.draft;
    const picker = this.picker = new ChoicePicker({choices: [], loading: true, pageSize: 100, window: {title: "Choose a roll table"},
      onPreview: async uuid => (await foundry.utils.fromUuid(uuid))?.sheet?.render({force: true}),
      onSelect: (uuid, entry) => {
        if (this.draft !== draft || draft.tables.some(table => table.uuid === uuid)) return;
        this.capture(); draft.tables.push({uuid, name: entry.name, count: 1});
        this.dirty = true; return this.render();
      }});
    await picker.render({force: true});
    const choices = await tableChoices();
    if (picker.rendered) { picker.entries = choices; picker.loading = false; await picker.render(); }
  }

  pickArt() {
    this.capture();
    return new foundry.applications.apps.FilePicker.implementation({type: "image", current: this.draft.img, callback: path => {
      this.capture();
      this.draft.img = path;
      this.dirty = true;
      this.render();
    }}).render({force: true});
  }

  async save(use) {
    if (this.saving) return;
    this.capture();
    const {name, img, source, description, threshold, traits, grants, tags, ranges, anomalyChance, sizeWounds, casting, tables} = this.draft;
    if (!name || traits.some(trait => !trait.name)) throw new Error("Name the ancestry and each ancestral trait.");
    if (Object.values(ranges).some(range => range.min && range.max && range.min > range.max)) throw new Error("A minimum die cannot exceed its maximum.");
    if (casting.some(entry => !validEntryName(entry.name) || !entry.trait) || new Set(casting.map(entry => entry.name.toLowerCase())).size !== casting.length)
      throw new Error("Give each casting pool a unique valid name and a trait.");
    if (grants.some(grant => grant.damage && !Roll.validate(grant.damage))) throw new Error("Enter a valid damage formula for each natural weapon.");
    const copy = !this.item?.isOwner || this.item.inCompendium;
    const original = this.item?.toObject();
    const data = {...(original ? skillData(original) : {}), name, img, type: "ancestry",
      system: {...original?.system, source, description, threshold, swid: original?.system.swid || slug(name),
        grants: grants.map(grant => this.nativeGrant(grant))},
      effects: [...(original?.effects ?? []).filter(effect => !effect.flags?.[MODULE_ID]?.[ANCESTRY_FLAG]), ...traits.map(ancestryTraitEffect)],
      flags: {...original?.flags, [EFFECTS]: {...original?.flags?.[EFFECTS], tags: attackTags(tags, game.modules.get(EFFECTS)?.api)},
        [MODULE_ID]: {...original?.flags?.[MODULE_ID], ancestryGrantPoints: Object.fromEntries(grants.map(grant => [grantKey(grant.uuid), grant.points])),
          [FORGE]: {ranges, anomalyChance, sizeWounds, casting, tables,
            grants: Object.fromEntries(grants.map(({uuid, name, img, points, mutation, ...settings}) => [grantKey(uuid), settings]))}}}};
    this.saving = true;
    try {
      new CONFIG.Item.documentClass(structuredClone(data), {strict: true});
      const item = copy ? await CONFIG.Item.documentClass.create(data) : await this.item.update(data);
      if (!item) throw new Error("Foundry could not save the ancestry.");
      this.load(item);
      await this.onSave?.(item, use);
      if (use) return this.close();
      ui.notifications.info(`Saved ${item.name}.`);
      return this.render();
    } finally { this.saving = false; }
  }

  nativeGrant({uuid, name, img, baseMutation, type, sides, modifier, damage, ap, attackTrait, range}) {
    const changes = foundry.utils.expandObject(baseMutation ?? {});
    if (type === "skill") {
      changes.system ??= {};
      if (sides) changes.system.die = {sides, modifier};
    }
    if (type === "weapon") {
      changes.system ??= {};
      changes.system.equipStatus = 4;
      if (damage) changes.system.damage = damage;
      if (ap !== "") changes.system.ap = bounded(Number(ap) || 0, 0, 40);
      if (attackTrait) changes.system.actions = {...changes.system.actions, trait: attackTrait};
      if (range) changes.system.range = range;
    }
    return {uuid, name, img, mutation: changes};
  }

  async _onClose(options) {
    await this.picker?.close();
    await this.sizePicker?.close();
    await super._onClose(options);
  }
}

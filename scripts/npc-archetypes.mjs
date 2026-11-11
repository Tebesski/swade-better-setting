import {ATTRIBUTES, RANKS, bounded} from "./npc-math.mjs";
import {makePreset, rankIndex} from "./npc-data.mjs";
import {validEntryName} from "./npc-casting.mjs";
import {CASTING_RULES, readCasting, spendAttributeSteps} from "./npc-forge-options.mjs";
import {MODULE_ID, slug} from "./skills.mjs";
import {archetypeLibrary, hasStandardArchetype, movementLibrary, removeArchetype, saveArchetype, standardArchetype, syncPresetSections} from "./npc-presets.mjs";
import {draggedLibraryItem, itemCategories, itemChoices, resolveItem} from "./npc-catalog.mjs";
import {ChoicePicker} from "./picker.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const DICE = {4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12"};
const GROWTH = {"": "Archetype default", rank: "Every rank", half: "Every other rank", fixed: "Fixed"};
const TYPES = {weapon: "Weapons", armor: "Armor", shield: "Shields", gear: "Gear", consumable: "Consumables",
  edge: "Edges", hindrance: "Hindrances", ability: "Abilities", action: "Actions", power: "Powers"};
const MODE = {melee: "Melee", ranged: "Ranged", power: "Damaging power", none: "None"};
const LOCATIONS = {0: "Stored", 1: "Carried", 2: "Off-Hand", 3: "Readied", 4: "Main Hand", 5: "Two Hands"};
const RANK_OPTIONS = Object.fromEntries(RANKS.map(rank => [rank, rank]));
const id = () => foundry.utils.randomID();
const dieLabel = die => `d${die.sides}${die.modifier ? `+${die.modifier}` : ""}`;
const report = error => ui.notifications.error(error.message);

export class ArchetypeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form", classes: ["sbs-setting-dialog", "sbs-npc-preset-editor", "sbs-archetype-editor"],
    window: {title: "Archetype Library", icon: "fa-solid fa-id-badge", resizable: true},
    position: {width: 900, height: 640},
    actions: {
      select: function (_event, control) { return this.switchTo(control.dataset.key).catch(report); },
      create: function () { return this.switchTo().catch(report); },
      duplicate: function () { return this.duplicate().catch(report); },
      remove: function () { return this.remove().catch(report); },
      addSkill: function () { this.capture(); this.draft.skills.push({name: "", sides: 6}); this.dirty = true; return this.render(); },
      removeSkill: function (_event, control) { this.capture(); this.draft.skills.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render(); },
      addItem: function () { return this.addItem().catch(report); },
      pickTrait: function (_event, control) { return this.pickTrait(control.dataset.input).catch(report); },
      pickAmmo: function (_event, control) { return this.pickAmmo(Number(control.dataset.index)).catch(report); },
      clearAmmo: function (_event, control) {
        this.capture(); const row = this.draft.loadout[Number(control.dataset.index)]; delete row.ammo;
        this.dirty = true; return this.render();
      },
      addCasting: function () {
        this.capture(); this.draft.casting.push({name: "", trait: "Spellcasting", points: 10, growth: 0, rule: "inherit"});
        this.dirty = true; return this.render();
      },
      removeCasting: function (_event, control) {
        this.capture(); this.draft.casting.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render();
      },
      pickEdge: function (_event, control) { return this.pickEdge(Number(control.dataset.index)).catch(report); },
      clearEdge: function (_event, control) {
        this.capture(); delete this.draft.casting[Number(control.dataset.index)].requires; this.dirty = true; return this.render();
      },
      removeItem: function (_event, control) { this.capture(); this.draft.loadout.splice(Number(control.dataset.index), 1); this.dirty = true; return this.render(); },
      save: function () { return this.save(false).catch(report); },
      use: function () { return this.save(true).catch(report); }
    }
  };
  static PARTS = {editor: {template: `modules/${MODULE_ID}/templates/npc-archetypes.hbs`,
    templates: [`modules/${MODULE_ID}/templates/npc-forge-casting.hbs`], scrollable: [".sbs-preset-form", ".sbs-preset-list"]}};

  constructor(key, skillNames, onSave) {
    super();
    this.skillNames = skillNames;
    this.onSave = onSave;
    this.previewRank = "Seasoned";
    this.previewSeed = id();
    this.loadoutType = "weapon";
    this.load(key);
  }

  load(key) {
    this.key = key;
    const profile = structuredClone(archetypeLibrary()[key] ?? standardArchetype("soldier"));
    const defaults = makePreset(key ?? "soldier", "Novice", profile.focus, undefined, false, profile);
    const {skills, ...data} = profile;
    this.draft = {...data, label: key ? data.label : "", core: defaults.core, animal: defaults.animal,
      focusDie: 4 + 2 * (profile.focusDie ?? 1),
      focusAttribute: profile.skillAttributes?.[slug(profile.focus)] ?? "",
      attack: {...profile.attack, name: profile.attack?.name ?? "", trait: profile.attack?.trait ?? "",
        damage: profile.attack?.damage ?? "", ap: defaults.ap, rof: defaults.signatureRof, pp: defaults.powerCost},
      loadout: (profile.loadout ?? []).map(row => ({...row, id: row.id ?? id(), chance: row.chance ?? 100,
        weight: row.weight ?? 1, quantity: row.quantity ?? 1})), casting: profile.casting ?? [], attributeGrowth: profile.attributeGrowth ?? {},
      attributeWeights: profile.attributeWeights ?? {}, weightedSteps: profile.weightedSteps ?? 0,
      skills: Object.entries(skills).map(([name, steps]) => ({name, sides: 4 + steps * 2,
        attribute: profile.skillAttributes?.[slug(name)], growth: profile.skillGrowth?.[slug(name)],
        chance: profile.skillOptions?.[slug(name)]?.chance ?? 100, arcane: profile.skillOptions?.[slug(name)]?.arcane}))};
    this.dirty = false;
  }

  capture() {
    if (!this.element?.querySelector("[name=label]")) return;
    const values = new FormData(this.element);
    const read = key => String(values.get(key) ?? "").trim();
    const number = (key, min, max) => bounded(Math.trunc(Number(read(key))) || 0, min, max);
    const d = this.draft;
    for (const key of ["label", "description", "focus", "focusAttribute", "mode", "movement", "tags"]) d[key] = read(key);
    for (const key of ["hardy", "core", "animal"]) d[key] = values.has(key);
    d.focusDie = number("focusDie", 4, 12);
    d.damageTier = number("damageTier", 0, 2);
    d.size = number("size", -4, 20);
    d.armor = number("armor", 0, 40);
    d.parry = number("parry", -12, 24);
    d.resilience = number("resilience", 0, 2);
    d.attributes = ATTRIBUTES.map(key => (number(`attribute-${key}`, 4, 12) - 6) / 2);
    d.attributeGrowth = Object.fromEntries(ATTRIBUTES.map(key => [key, read(`growth-${key}`)]));
    d.attributeWeights = Object.fromEntries(ATTRIBUTES.map(key => [key, number(`weight-${key}`, 0, 5)]));
    d.weightedSteps = number("weightedSteps", 0, 5);
    for (const key of ["name", "trait", "range", "damage"]) d.attack[key] = read(`attack-${key}`);
    d.attack.ap = number("attack-ap", 0, 40);
    d.attack.rof = number("attack-rof", 1, 6);
    d.attack.pp = number("attack-pp", 0, 100);
    d.skills = d.skills.map((_row, i) => ({name: read(`skill-name-${i}`), sides: number(`skill-die-${i}`, 4, 12),
      attribute: read(`skill-attribute-${i}`), growth: read(`skill-growth-${i}`),
      chance: read(`skill-chance-${i}`) === "" ? 100 : number(`skill-chance-${i}`, 0, 100), arcane: values.has(`skill-arcane-${i}`)}));
    d.loadout = d.loadout.map((row, i) => ({...row, rank: read(`item-rank-${i}`) || RANKS[0], maxRank: read(`item-max-rank-${i}`),
      slot: read(`item-slot-${i}`), kit: read(`item-kit-${i}`), weight: number(`item-weight-${i}`, 1, 100),
      chance: number(`item-chance-${i}`, 0, 100), quantity: number(`item-quantity-${i}`, 1, 999),
      casting: read(`item-casting-${i}`), equip: read(`item-equip-${i}`), ammoQuantity: number(`item-ammo-quantity-${i}`, 1, 999)}));
    d.casting = readCasting(values, d.casting);
  }

  profile() {
    const {skills, focusDie, focusAttribute, ...draft} = this.draft;
    const filled = skills.filter(row => row.name);
    const linked = Object.fromEntries(filled.filter(row => row.attribute).map(row => [slug(row.name), row.attribute]));
    if (focusAttribute && draft.focus) linked[slug(draft.focus)] = focusAttribute;
    return {...draft, focusDie: (focusDie - 4) / 2,
      skills: Object.fromEntries(filled.map(row => [row.name, (row.sides - 4) / 2])),
      skillAttributes: linked,
      skillOptions: Object.fromEntries(filled.filter(row => row.arcane || row.chance !== 100).map(row => [slug(row.name), {chance: row.chance, arcane: row.arcane}])),
      skillGrowth: Object.fromEntries(filled.filter(row => row.growth).map(row => [slug(row.name), row.growth]))};
  }

  async _prepareContext() {
    const profile = this.profile();
    const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, game.i18n.localize(CONFIG.SWADE.attributes[key].long)]));
    const sample = this.sample(profile);
    return {draft: this.draft, key: this.key, standard: this.key && hasStandardArchetype(this.key), previewRank: this.previewRank,
      previewWild: this.previewWild, loadoutType: this.loadoutType, castingRules: CASTING_RULES, canRequireEdge: true,
      library: Object.entries(archetypeLibrary()).map(([key, profile]) => ({key, name: profile.label, active: key === this.key})).sort((a,b) => a.name.localeCompare(b.name)),
      ranks: RANK_OPTIONS, dice: DICE, modes: MODE, types: TYPES, growth: GROWTH, attributes, locations: LOCATIONS,
      traitList: `${this.id}-traits`, skillNames: this.skillNames,
      movement: Object.fromEntries(movementLibrary().map(row => [row.id, row.label])),
      attributeRows: ATTRIBUTES.map((key, i) => ({key, name: attributes[key], sides: 6 + 2 * profile.attributes[i],
        growth: profile.attributeGrowth?.[key], weight: profile.attributeWeights?.[key] ?? 0, preview: dieLabel(sample.attributes[key])})),
      previewSkills: this.skillPreview(sample),
      canUse: !!this.onSave};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.parts.editor;
    const drop = root.querySelector("[data-loadout-drop]");
    drop.ondragover = event => event.preventDefault();
    drop.ondrop = event => {
      event.preventDefault();
      void draggedLibraryItem(event).then(entry => { if (entry && Object.hasOwn(TYPES, entry.type)) return this.addLoadout(entry); }).catch(report);
    };
    root.oninput = event => {
      const {name, value, checked} = event.target;
      if (!name) return;
      if (name === "loadoutType") { this.loadoutType = value; return; }
      if (name === "previewRank") this.previewRank = value;
      else if (name === "previewWild") this.previewWild = checked;
      else this.dirty = true;
      this.capture();
      this.refreshPreview(root);
    };
  }

  sample(profile = this.profile()) {
    const sample = makePreset(this.key, this.previewRank, profile.focus, undefined, this.previewWild, profile);
    sample.attributes = spendAttributeSteps(sample.attributes, profile.attributeWeights, profile.weightedSteps * rankIndex(this.previewRank), this.previewSeed);
    return sample;
  }

  skillPreview(sample) {
    return Object.entries(sample.skills).filter(([name]) => name).map(([name, die]) => `${name} ${dieLabel(die)}`).join(" · ");
  }

  refreshPreview(root) {
    const sample = this.sample();
    for (const cell of root.querySelectorAll("[data-attribute-preview]")) cell.textContent = dieLabel(sample.attributes[cell.dataset.attributePreview]);
    root.querySelector("[data-rank-preview]").textContent = this.previewRank;
    root.querySelector("[data-skill-preview]").textContent = this.skillPreview(sample);
  }

  _preSyncPartState(part, next, prior, state) {
    super._preSyncPartState(part, next, prior, state);
    syncPresetSections(next, prior);
  }

  async switchTo(key) {
    if (key && key === this.key) return;
    if (this.dirty && !await DialogV2.confirm({window: {title: "Discard unsaved changes?"}, content: "<p>Switch archetypes and discard the current edits?</p>", rejectClose: false})) return;
    this.load(key);
    return this.render();
  }

  async duplicate() {
    this.capture();
    this.key = undefined;
    const label = this.draft.label || "Archetype";
    const names = new Set(Object.values(archetypeLibrary()).map(row => row.label.toLowerCase()));
    let suffix = 1;
    while (names.has(`${label} (${suffix})`.toLowerCase())) suffix++;
    this.draft.label = `${label} (${suffix})`;
    this.dirty = true;
    return this.render();
  }

  async remove() {
    const standard = hasStandardArchetype(this.key);
    if (!await DialogV2.confirm({window: {title: standard ? "Restore built-in archetype?" : "Delete archetype?"},
      content: `<p>${standard ? "Restore this archetype’s original defaults?" : "Remove this archetype from the world library?"}</p>`, rejectClose: false})) return;
    const key = this.key;
    await removeArchetype(key);
    this.load(standard ? key : "soldier");
    await this.onSave?.(key, false);
    return this.render();
  }

  async addItem() {
    this.capture();
    const type = this.element.querySelector("[name=loadoutType]").value;
    const draft = this.draft;
    return this.pickItem(type, entry => { if (this.draft === draft) return this.addLoadout(entry); });
  }

  addLoadout(entry) {
    this.capture();
    this.draft.loadout.push({id: id(), uuid: entry.key, type: entry.type, name: entry.name, rank: RANKS[0],
      chance: 100, weight: 1, quantity: 1, ammoQuantity: 1});
    this.dirty = true;
    return this.render();
  }

  async pickItem(type, onSelect) {
    await this.picker?.close();
    const picker = this.picker = new ChoicePicker({choices: [], loading: true, pageSize: 100, window: {title: `Choose ${(TYPES[type] ?? type).toLowerCase()}`},
      onPreview: async uuid => (await resolveItem(uuid, type)).sheet.render({force: true}),
      onSelect: (uuid, entry) => onSelect({key: uuid, type, name: entry.name, img: entry.img})});
    await picker.render({force: true});
    const choices = await itemChoices(type);
    if (picker.rendered) {
      picker.categories = itemCategories(choices);
      picker.entries = choices; picker.loading = false; await picker.render();
    }
  }

  async pickTrait(name) {
    await this.picker?.close();
    const choices = this.skillNames.map(skill => ({key: skill, name: skill, detail: "Skill"}));
    if (name !== "focus" && !name.startsWith("skill-name")) for (const key of ATTRIBUTES) {
      const label = game.i18n.localize(CONFIG.SWADE.attributes[key].long);
      choices.push({key: label, name: label, detail: "Attribute"});
    }
    const draft = this.draft;
    this.picker = new ChoicePicker({choices, window: {title: "Choose a trait"}, onSelect: value => {
      if (this.draft !== draft) return;
      const input = this.element.querySelector(`[name="${name}"]`);
      if (input) { input.value = value; input.dispatchEvent(new Event("input", {bubbles: true})); }
    }});
    return this.picker.render({force: true});
  }

  async pickEdge(index) {
    const draft = this.draft;
    return this.pickItem("edge", entry => {
      if (this.draft !== draft || !draft.casting[index]) return;
      this.capture(); draft.casting[index].requires = {uuid: entry.key, name: entry.name};
      this.dirty = true; return this.render();
    });
  }

  async pickAmmo(index) {
    const type = this.element.querySelector(`[name="ammo-type-${index}"]`).value;
    const draft = this.draft;
    return this.pickItem(type, entry => {
      if (this.draft !== draft || !draft.loadout[index]) return;
      this.capture(); draft.loadout[index].ammo = {uuid: entry.key, name: entry.name, type};
      this.dirty = true; return this.render();
    });
  }

  async save(use) {
    if (this.saving) return;
    this.capture();
    const profile = this.profile();
    if (!profile.label || !profile.focus) throw new Error("Enter an archetype name and primary skill.");
    const names = this.draft.skills.filter(row => row.name).map(row => slug(row.name));
    if (new Set(names).size !== names.length) throw new Error("Each supporting skill can be listed once.");
    if (profile.attack.damage && !Roll.validate(profile.attack.damage)) throw new Error("Enter a valid SWADE damage formula.");
    const castingNames = profile.casting.map(entry => entry.name.toLowerCase());
    if (profile.casting.some(entry => !validEntryName(entry.name) || !entry.trait) || new Set(castingNames).size !== castingNames.length)
      throw new Error("Give each casting pool a unique valid name and a trait.");
    for (const row of profile.loadout) if (rankIndex(row.rank) < 0) row.rank = RANKS[0];
    if (profile.loadout.some(row => row.maxRank && rankIndex(row.maxRank) < rankIndex(row.rank)))
      throw new Error("The maximum loadout rank must be at least the minimum rank.");
    this.saving = true;
    try {
      const key = this.key ?? id();
      await saveArchetype(key, profile);
      this.key = key;
      this.dirty = false;
      await this.onSave?.(key, use);
      if (use) return this.close();
      ui.notifications.info(`Saved ${profile.label}.`);
      return this.render();
    } finally { this.saving = false; }
  }

  async _onClose(options) {
    await this.picker?.close();
    await super._onClose(options);
  }
}

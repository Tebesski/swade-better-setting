import {MODULE_ID, normalizeName} from "./skills.mjs";
import {resolveCompendiumName} from "./compendium-names.mjs";

const LEGACY_PACK = "world.better-setting-modifiers";
const LEGACY_ITEM = "BetterModifiers0";
const POWERS = "swade-better-powers";
const TEMPLATES = "swade-better-templates";
const SETTING = "modifierCompendium";
const DRAG_TYPE = "application/x-better-swade-modifier";
const {ApplicationV2, DialogV2, HandlebarsApplicationMixin} = foundry.applications.api;
const clone = foundry.utils.deepClone;
const randomID = foundry.utils.randomID;
const report = error => ui.notifications.error(error.message);
let writes = Promise.resolve();
let library;
let refreshLocalLibrary = true;

export function addonAPI(id) {
  const module = game.modules.get(id);
  return module?.active ? module.api : undefined;
}

const data = () => game.settings.get(MODULE_ID, SETTING);
const rows = () => data().entries;
const powerRows = item => item?.flags?.[POWERS]?.powerModifiers ?? item?.flags?.[MODULE_ID]?.powerModifiers ?? [];
const templateRows = item => item?.flags?.[TEMPLATES]?.automation?.modifiers ?? [];
const sharedOptions = row => row.options?.length ? row.options : [{id: "base", label: "", cost: 0}];

function modifierPair(power, template, global = false) {
  const source = power ?? template;
  const {id, name, description = ""} = source;
  const shared = {id, name, description, options: sharedOptions(source).map(({id, label, cost}) => ({id, label: label ?? "", cost: Number(cost) || 0}))};
  const project = original => ({...original, ...shared, options: shared.options.map(option => ({
    ...original?.options?.find(candidate => candidate.id === option.id), ...option
  }))});
  return {id, name, global, powers: project(power), templates: project(template)};
}

export function getGlobalModifiers(item, kind, local = []) {
  if (item?.type !== "power") return [];
  const defined = [...local, ...powerRows(item), ...templateRows(item)];
  const ids = new Set(defined.map(row => row.id));
  const names = new Set(defined.map(row => normalizeName(row.name)));
  return rows().filter(row => row.global && !ids.has(row.id) && !names.has(normalizeName(row.name))).map(row => clone(row[kind]));
}

function writeEntries(change, {refresh = true} = {}) {
  const pending = writes.then(async () => {
    if (!game.user.isGM) throw new Error("A GM must manage the Modifiers Compendium.");
    const current = data();
    const next = await change(clone(current.entries));
    if (next) {
      refreshLocalLibrary = refresh;
      try { await game.settings.set(MODULE_ID, SETTING, {...current, entries: next}); }
      finally { refreshLocalLibrary = true; }
    }
    return Boolean(next);
  });
  writes = pending.catch(() => {});
  return pending;
}

function rename(entry, id, name, global = entry.global) {
  return {...entry, id, name, global, powers: {...entry.powers, id, name}, templates: {...entry.templates, id, name}};
}

function saveEntry(entry, {preserveGroup = false} = {}) {
  return writeEntries(async entries => {
    const name = entry.name.trim();
    if (!name) throw new Error("Enter a name for the modifier.");
    const choice = await resolveCompendiumName(name, entries, "modifier");
    if (!choice) return;
    const id = choice.replace?.id ?? entry.id;
    const next = rename(entry, id, choice.name, preserveGroup ? choice.replace?.global ?? entry.global : entry.global);
    if (choice.replace) return entries.map(row => row.id === id ? next : row);
    return [...entries, next];
  });
}

export async function saveModifierToLibrary(item, id) {
  const power = powerRows(item).find(row => row.id === id);
  const template = templateRows(item).find(row => row.id === id);
  if (!power && !template) throw new Error("Save the modifier before adding it to the compendium.");
  const entry = modifierPair(power, template);
  if (await saveEntry(rename(entry, randomID(), entry.name), {preserveGroup: true})) ui.notifications.info("Modifier saved to the compendium.");
}

export function writeModifierDrag(event, source, id, uuid) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({source, id, uuid}));
  event.dataTransfer.effectAllowed = "copy";
}

export const hasModifierDrag = event => Array.from(event.dataTransfer?.types ?? []).includes(DRAG_TYPE);
export function readModifierDrag(event) {
  try { return JSON.parse(event.dataTransfer.getData(DRAG_TYPE)); }
  catch { return null; }
}

export async function applyLibraryModifier(item, id) {
  if (item?.type !== "power" || !item.isOwner || (item.compendium?.locked && item.pack)) return false;
  const entry = rows().find(row => row.id === id && !row.global);
  if (!entry) throw new Error("This individual modifier is no longer available.");
  const power = powerRows(item);
  const template = templateRows(item);
  const existing = [...new Map([...template, ...power].map(row => [row.id, row])).values()];
  const choice = await resolveCompendiumName(entry.name, existing, "modifier");
  if (!choice) return false;
  const imported = rename(clone(entry), choice.replace?.id ?? randomID(), choice.name);
  const upsert = (list, row) => list.some(old => old.id === row.id) ? list.map(old => old.id === row.id ? row : old) : [...list, row];
  const update = {
    [`flags.${POWERS}.powerModifiers`]: upsert(powerRows(item), imported.powers),
    [`flags.${TEMPLATES}.automation.modifiers`]: upsert(templateRows(item), imported.templates)
  };
  const automation = item.flags?.[TEMPLATES]?.automation;
  const hasTemplateChanges = imported.templates.options.some(option => option.changes?.some(change =>
    change.type !== "adjustDuration" || change.system?.scope !== "power"));
  const placeholder = !automation || Object.keys(automation).every(key => ["enabled", "modifiers", "raises"].includes(key));
  if (!automation || (placeholder && hasTemplateChanges)) {
    update[`flags.${TEMPLATES}.automation.enabled`] = hasTemplateChanges;
    if (hasTemplateChanges) update[`flags.${TEMPLATES}.automation.expiration.enabled`] = false;
  }
  await item.update(update);
  return true;
}

async function migrateLegacyCatalog() {
  if (data().migrated || game.users.activeGM?.id !== game.user.id) return;
  const catalog = await game.packs.get(LEGACY_PACK)?.getDocument(LEGACY_ITEM);
  const power = powerRows(catalog), template = templateRows(catalog);
  const globalIds = new Set(catalog?.flags?.[MODULE_ID]?.globalModifiers ?? []);
  const ids = new Set([...power, ...template].map(row => row.id));
  const entries = [...ids].map(id => modifierPair(power.find(row => row.id === id), template.find(row => row.id === id), globalIds.has(id)));
  await game.settings.set(MODULE_ID, SETTING, {migrated: true, entries: [...rows(), ...entries]});
  if (ui.compendium?.rendered) void ui.compendium.render();
}

const findEntry = (entries, id) => {
  const entry = entries.find(row => row.id === id);
  if (!entry) throw new Error("This modifier was removed.");
  return entry;
};
const formattedCost = cost => cost > 0 ? `+${cost}` : String(cost ?? 0);
const optionId = element => element.closest("[data-option-id]").dataset.optionId;
const rowId = element => element.closest("details[data-modifier-id]").dataset.modifierId;

function updateOption(entry, id, update) {
  for (const kind of ["powers", "templates"]) {
    const option = entry[kind].options.find(row => row.id === id);
    if (option) Object.assign(option, update);
  }
}

function saveBehaviors(id, optionId, kind, changes, previous) {
  return writeEntries(entries => {
    const entry = findEntry(entries, id);
    const option = entry[kind].options.find(row => row.id === optionId);
    if (!option) return;
    const shared = change => change.type === "adjustDuration" && change.system?.scope === "power";
    const other = kind === "powers" ? "templates" : "powers";
    const paired = entry[other].options.find(row => row.id === optionId);
    const sharedChanges = changes.filter(shared);
    const editedShared = JSON.stringify(previous.filter(shared)) !== JSON.stringify(sharedChanges);
    const storedShared = (option.changes ?? []).filter(shared);
    option.changes = editedShared || JSON.stringify(storedShared) === JSON.stringify(sharedChanges)
      ? changes : [...changes.filter(change => !shared(change)), ...storedShared];
    if (paired && editedShared) paired.changes = [...(paired.changes ?? []).filter(change => !shared(change)), ...sharedChanges];
    return entries;
  }, {refresh: false});
}

class ModifierLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({item} = {}) { super(); this.item = item; }
  descriptionTimers = new Map();
  static DEFAULT_OPTIONS = {
    classes: ["sbs-modifier-library"], position: {width: 560, height: 540},
    window: {title: "Modifiers Compendium", icon: "fa-solid fa-sliders", resizable: true},
    actions: Object.fromEntries(["create", "remove", "addOption", "removeOption", "select"].map(action =>
      [action, async function (_event, target) { try { await this.act(action, target); } catch (error) { report(error); } }]))
  };
  static PARTS = {body: {template: `modules/${MODULE_ID}/templates/modifier-library.hbs`, scrollable: [".sbs-library-entries"]}};

  async _prepareContext() {
    const root = this.element;
    const open = new Set(Array.from(root?.querySelectorAll("details[open][data-modifier-id]") ?? [], row => row.dataset.modifierId));
    const picker = Boolean(this.item);
    const editable = game.user.isGM && !picker;
    const sorted = [...rows()].sort((a, b) => a.name.localeCompare(b.name));
    const groups = (picker ? ["Individual"] : ["Individual", "Global"]).map((label, index) => ({
      label, open: root?.querySelector(`[data-group-name="${label}"]`)?.open ?? !index,
      rows: sorted.filter(row => row.global === Boolean(index)).map(row => ({
        ...row.powers, global: row.global, expanded: open.has(row.id) || this.expand === row.id,
        description: foundry.utils.cleanHTML(row.powers.description ?? ""),
        options: sharedOptions(row.powers).map(option => ({...option, removable: row.powers.options.length > 1,
          displayCost: formattedCost(option.cost),
          costText: option.cost ? formattedCost(option.cost) : ""}))
      }))
    }));
    this.expand = undefined;
    return {groups, editable, picker, search: root?.querySelector("[type=search]")?.value ?? "",
      powers: Boolean(addonAPI(POWERS)?.renderLibraryBehaviors), templates: Boolean(addonAPI(TEMPLATES)?.renderLibraryBehaviors)};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const input = this.element.querySelector("[type=search]");
    const filter = () => {
      const query = normalizeName(input.value);
      for (const row of this.element.querySelectorAll("details[data-modifier-id]")) row.hidden = !normalizeName(row.dataset.name).includes(query);
    };
    filter();
    input.addEventListener("input", filter);
    if (context.editable) this.bindEditor(this.element.querySelector(".sbs-library-entries"), filter);
    this.element.ondragstart = event => {
      const row = event.target.closest("[draggable][data-modifier-id]");
      if (row) writeModifierDrag(event, "library", row.dataset.modifierId);
    };
    this.element.ondragover = event => {
      if (context.editable && hasModifierDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
    };
    this.element.ondrop = async event => {
      if (!context.editable || !hasModifierDrag(event)) return;
      event.preventDefault();
      const drop = readModifierDrag(event);
      if (drop?.source !== "power" || !drop.uuid || !drop.id) return;
      try {
        await this.flushDescriptions();
        await saveModifierToLibrary(await foundry.utils.fromUuid(drop.uuid), drop.id);
      } catch (error) { report(error); }
    };
  }

  bindEditor(root, filter) {
    const mountBehaviors = panel => {
      if (!panel.open) return;
      const entry = rows().find(row => row.id === panel.dataset.modifierId);
      if (!entry) return;
      for (const host of panel.querySelectorAll("[data-library-behaviors]:empty")) {
        const kind = host.dataset.libraryBehaviors;
        const id = optionId(host);
        const api = addonAPI(kind === "powers" ? POWERS : TEMPLATES);
        if (api?.renderLibraryBehaviors && !host.dataset.mounted) {
          host.dataset.mounted = "true";
          const modifier = clone(entry[kind]);
          let previous = modifier.options.find(option => option.id === id)?.changes ?? [];
          void Promise.resolve(api.renderLibraryBehaviors(host, modifier, id, async changes => {
            await saveBehaviors(entry.id, id, kind, changes, previous);
            previous = changes;
          })).catch(report);
        }
      }
    };
    for (const panel of root.querySelectorAll("details[data-modifier-id]")) {
      mountBehaviors(panel);
      panel.addEventListener("toggle", () => mountBehaviors(panel));
    }

    root.addEventListener("input", event => {
      const editor = event.target.closest("prose-mirror[name^=sbs-description-]");
      if (!editor) return;
      clearTimeout(this.descriptionTimers.get(editor));
      this.descriptionTimers.set(editor, setTimeout(() => { void this.saveDescription(editor).catch(report); }, 250));
    });
    root.addEventListener("change", event => {
      const field = event.target;
      if (field.matches("[data-modifier-name]")) void this.saveName(field).then(filter).catch(report);
      if (field.matches("[data-option-name]")) {
        const id = rowId(field), option = optionId(field), label = field.value.trim();
        void writeEntries(entries => {
          updateOption(findEntry(entries, id), option, {label});
          return entries;
        }, {refresh: false}).catch(report);
      }
      if (field.matches("prose-mirror[name^=sbs-description-]")) void this.saveDescription(field).catch(report);
    });
    root.addEventListener("close", event => {
      const editor = event.target;
      if (!editor.matches("prose-mirror[name^=sbs-description-]")) return;
      const preview = editor.querySelector(".editor-content");
      if (preview) preview.innerHTML = foundry.utils.cleanHTML(editor.value ?? "");
    });
    root.addEventListener("keydown", event => {
      if (event.key !== "Enter" || !event.target.matches("[data-option-cost], [data-modifier-name], [data-option-name]")) return;
      event.preventDefault();
      event.target.blur();
    });
    root.addEventListener("focusout", event => {
      if (!event.target.matches("[data-option-cost]")) return;
      const field = event.target;
      const id = rowId(field), option = optionId(field);
      const raw = field.textContent.trim();
      const cost = raw === "" ? 0 : Number(raw);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)?$/.test(raw) || !Number.isFinite(cost)) {
        const saved = rows().find(row => row.id === id)?.powers.options.find(row => row.id === option)?.cost ?? 0;
        field.textContent = saved ? formattedCost(saved) : "";
        return report(new Error("Enter a numeric modifier cost."));
      }
      field.textContent = cost ? formattedCost(cost) : "";
      void writeEntries(entries => {
        updateOption(findEntry(entries, id), option, {cost});
        return entries;
      }, {refresh: false}).catch(report);
    });
  }

  saveDescription(editor) {
    clearTimeout(this.descriptionTimers.get(editor));
    this.descriptionTimers.delete(editor);
    const id = rowId(editor);
    const description = foundry.utils.cleanHTML(editor.value ?? "");
    return writeEntries(entries => {
      const entry = entries.find(row => row.id === id);
      if (!entry || entry.powers.description === description) return;
      entry.powers.description = entry.templates.description = description;
      return entries;
    }, {refresh: false});
  }

  async flushDescriptions() {
    const active = this.element?.querySelectorAll("prose-mirror.active[name^=sbs-description-]") ?? [];
    await Promise.all([...new Set([...this.descriptionTimers.keys(), ...active])].map(editor => this.saveDescription(editor)));
  }

  async close(options) {
    if (this.rendered && game.user.isGM && !this.item) {
      // Blur any focused plain-text or cost field before removing its DOM.
      if (this.element.contains(document.activeElement)) document.activeElement.blur();
      await this.flushDescriptions().catch(report);
      await writes;
    }
    return super.close(options);
  }

  async saveName(field) {
    const id = rowId(field);
    const name = field.value.trim();
    let newName, replaced = false;
    await writeEntries(async entries => {
      const entry = findEntry(entries, id);
      if (!name || name === entry.name) return;
      const choice = await resolveCompendiumName(name, entries, "modifier", {exclude: id});
      if (!choice) return;
      newName = choice.name;
      replaced = Boolean(choice.replace);
      const replacementId = choice.replace?.id ?? id;
      return entries.filter(row => row.id !== choice.replace?.id).map(row => row.id === id ? rename(entry, replacementId, choice.name) : row);
    }, {refresh: false});
    if (replaced) return this.render();
    const saved = newName ?? rows().find(row => row.id === id)?.name;
    if (!field.isConnected || !saved) return;
    if (field.value.trim() === name) field.value = saved;
    const panel = field.closest("details[data-modifier-id]");
    panel.dataset.name = saved;
    panel.querySelector("[data-modifier-title]").textContent = saved;
  }

  async act(action, target) {
    const panel = target.closest("details[data-modifier-id]");
    const id = panel?.dataset.modifierId;
    if (action === "select") {
      if (await applyLibraryModifier(this.item, id)) await this.close();
      return;
    }
    if (!game.user.isGM || this.item) return;
    await this.flushDescriptions();
    if (action === "create") {
      const global = target.closest("[data-group-name]").dataset.groupName === "Global";
      const name = await DialogV2.prompt({classes: ["sbs-compendium-dialog"], window: {title: "Create modifier"}, rejectClose: false,
        content: '<label>Name <input name="name" required></label>',
        ok: {label: "Create", callback: (_event, button) => button.form.elements.name.value.trim()}});
      if (!name) return;
      const modifier = {id: randomID(), name, description: "", options: [{id: randomID(), label: "", cost: 0}]};
      this.expand = modifier.id;
      await saveEntry(modifierPair(modifier, undefined, global));
      return;
    }
    if (action === "remove") {
      if (await DialogV2.confirm({classes: ["sbs-compendium-dialog"], window: {title: "Remove modifier"},
        content: "<p>Remove this modifier from the compendium?</p>", rejectClose: false})) {
        await writeEntries(entries => entries.filter(row => row.id !== id));
      }
      return;
    }

    const option = action === "removeOption" ? optionId(target) : randomID();
    this.expand = id;
    const updated = await writeEntries(entries => {
      const entry = findEntry(entries, id);
      if (action === "removeOption" && entry.powers.options.length <= 1) return;
      for (const kind of ["powers", "templates"]) {
        const options = entry[kind].options;
        entry[kind].options = action === "addOption" ? [...options, {id: option, label: "", cost: 0}] : options.filter(row => row.id !== option);
      }
      return entries;
    }, {refresh: false});
    if (updated) await this.render();
    if (action === "addOption") {
      this.element.querySelector(`[data-option-id="${CSS.escape(option)}"] [data-option-name]`)?.focus();
    }
  }
}

export function openModifierLibrary({item} = {}) {
  if (item) return new ModifierLibrary({item}).render({force: true});
  library ??= new ModifierLibrary();
  return library.render({force: true});
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {scope: "world", config: false, type: Object,
    default: {migrated: false, entries: []}, onChange: () => {
      if (refreshLocalLibrary && library?.rendered) void library.render().catch(report);
    }});
  // Keep the old setting registered so existing worlds can load before migration.
  game.settings.register(MODULE_ID, "globalModifierCatalog", {scope: "world", config: false, type: Object, default: {powers: [], templates: []}});
});
Hooks.once("ready", () => { void migrateLegacyCatalog().catch(report); });
Hooks.on("renderCompendiumDirectory", (_app, root) => {
  if (data().migrated) root.querySelectorAll(`[data-pack="${LEGACY_PACK}"], [data-entry-id="${LEGACY_PACK}"]`).forEach(node => { node.hidden = true; });
});

export {resolveCompendiumName};

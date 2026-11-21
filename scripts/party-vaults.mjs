import {t as sbsI18n} from "./i18n.mjs";
import {MODULE_ID} from "./skills.mjs";
import {ChoicePicker} from "./picker.mjs";

const GRID = "swade-grid-inventory";
const REGISTRY = "partyInventories";
const allVaults = "all";
const vaultIcon = "icons/containers/chest/chest-reinforced-steel-red.webp";
const colors = ["#4f99c9", "#d58646", "#4f9f77", "#aa77bd", "#cf6969", "#bc9b45", "#4fa5aa"];
const modes = ["public", "private"];
const registry = () => game.settings.get(MODULE_ID, REGISTRY);
const stateOf = party => registry()[party.id] ?? {grid: false, slots: []};
const gridApi = () => game.modules.get(GRID)?.active ? game.modules.get(GRID).api?.partyStorage : null;
const levels = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
const vaultActor = slot => game.actors.get(slot.actorId);
const partyRoot = party => party.getFlag(MODULE_ID, "partyStorage")?.rootId;
const notify = error => ui.notifications.warn(error.message);
const recoveryWindows = new Map();
let queue = Promise.resolve();

export const isPartyVault = actor => !!actor?.getFlag(MODULE_ID, "partyStorage")?.partyId;

function queued(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}

function save(party, state) {
  return game.settings.set(MODULE_ID, REGISTRY, {...registry(), [party.id]: state});
}

function access(party, slot, user) {
  const {NONE, LIMITED, OBSERVER, OWNER} = levels();
  if (user.isGM) return OWNER;
  if (Object.hasOwn(slot.grants ?? {}, user.id)) {
    const grant = slot.grants[user.id];
    return slot.visibility === "private" && grant < OBSERVER ? NONE : grant;
  }
  if (Number.isInteger(slot.defaultOwnership) && party.testUserPermission(user, "LIMITED")) {
    return slot.visibility === "private" && slot.defaultOwnership < OBSERVER ? NONE : slot.defaultOwnership;
  }
  if (slot.visibility === "private" || !party.testUserPermission(user, "LIMITED")) return NONE;
  if (!party.testUserPermission(user, "OBSERVER")) return LIMITED;
  return slot.accessibility === "private" ? OBSERVER : OWNER;
}

function ownership(party, slot) {
  return Object.fromEntries([["default", levels().NONE],
    ...game.users.filter(user => !user.isGM).map(user => [user.id, access(party, slot, user)])]);
}

async function syncOwnership(party, slot) {
  const actor = vaultActor(slot);
  if (!actor) return;
  const next = ownership(party, slot);
  const operations = [];
  if (Object.keys(actor.ownership).length !== Object.keys(next).length
    || Object.entries(next).some(([id, grant]) => actor.ownership[id] !== grant)) {
    operations.push({action: "update", documentName: "Actor",
      updates: [{_id: actor.id, ownership: foundry.data.operators.ForcedReplacement.create(next)}]});
  }
  const root = actor.items.get(slot.rootId);
  if (root) {
    const path = `flags.${GRID}.item.container`;
    const config = root.flags[GRID]?.item?.container;
    if (config?.visibility !== slot.visibility || config?.accessibility !== slot.accessibility) {
      operations.push({action: "update", documentName: "Item", parent: actor, updates: [{_id: root.id,
        [path + ".visibility"]: slot.visibility, [path + ".accessibility"]: slot.accessibility}]});
    }
  }
  if (operations.length) {
    const results = await foundry.documents.modifyBatch(operations);
    if (results.length !== operations.length || results.some(result => result.length !== 1)) {
      throw new Error(sbsI18n("swade-better-setting.UI.Foundrycouldnotupdatevaultaccess_6b8026facb"));
    }
  }
}

function newContainer(name, width, height, color) {
  return {name, type: gridApi().CONTAINER, img: vaultIcon, system: {equipStatus: 1},
    flags: {[MODULE_ID]: {partyStorageRoot: true}, [GRID]: {item: {
      container: {layout: "grid", enabled: true, width, height, color, visibility: "public", accessibility: "public"}
    }}}};
}

async function mount(party, slot, data) {
  const rootId = foundry.utils.randomID();
  data._id = rootId;
  data.folder = null;
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.partyStorageRoot`, true);
  delete data.flags?.[GRID]?.placement;
  data.system.equipStatus = 1;
  const actor = await CONFIG.Actor.documentClass.create({
    name: data.name, type: "group", img: data.img, ownership: ownership(party, slot),
    flags: {[MODULE_ID]: {partyStorage: {partyId: party.id, slotId: slot.id, rootId}}},
    items: [data]
  }, {keepEmbeddedIds: true, renderSheet: false});
  if (!actor?.items.has(rootId)) {
    await actor?.delete();
    throw new Error(sbsI18n("swade-better-setting.UI.Couldnotcreatethevaultcontainer_114d728b2d"));
  }
  return {...slot, actorId: actor.id, rootId, containerName: data.name};
}

function characterPlayers(party) {
  const players = game.users.filter(user => !user.isGM);
  const assigned = new Map();
  for (const {actor} of party.system.members.values()) {
    if (actor?.type !== "character") continue;
    const controller = players.find(user => user.character?.uuid === actor.uuid)
      ?? players.find(user => actor.testUserPermission(user, "OWNER", {exact: true}));
    assigned.set(actor, controller?.id);
  }
  return assigned;
}

async function toggleGrid(party) {
  if (!game.user.isGM || !gridApi()) return;
  return queued(async () => {
    const state = stateOf(party);
    if (state.initialized) return save(party, {...state, grid: !state.grid});
    const members = characterPlayers(party);
    const others = game.users.filter(user => !user.isGM && [...members.keys()].some(member =>
      user.character?.uuid === member.uuid || member.testUserPermission(user, "OWNER", {exact: true})));
    const slots = [];
    const palette = [];
    try {
      if (!party.getFlag(MODULE_ID, "partyStorage")) await party.setFlag(MODULE_ID, "partyStorage", {partyInventory: true});
      for (const [member, ownerId] of members) {
        const name = member.name + " Vault";
        const slot = {id: foundry.utils.randomID(), label: name, ownerId: ownerId ?? null,
          visibility: "public", accessibility: "public",
          grants: Object.fromEntries(others.map(({id}) => [id, id === ownerId ? levels().OWNER : levels().OBSERVER]))};
        if (!palette.length) palette.push(...colors);
        const [color] = palette.splice(Math.floor(Math.random() * palette.length), 1);
        slots.push(await mount(party, slot, newContainer(name, 5, 5, color)));
      }
      await save(party, {grid: true, initialized: true, slots});
    } catch (error) {
      for (const slot of slots) await vaultActor(slot)?.delete();
      throw error;
    }
  });
}

const dialog = () => foundry.applications.api.DialogV2;

function labelControl(doc, content, label, control) {
  const row = doc.createElement("label");
  row.className = "sbs-party-vault-field";
  row.append(label, control);
  content.append(row);
  return control;
}

function editSlot(party, id) {
  if (!game.user.isGM) return;
  const existing = stateOf(party).slots.find(slot => slot.id === id);
  if (id && !existing) return;
  const content = document.createElement("div");
  const fields = [
    [sbsI18n("swade-better-setting.UI.Nameoptional_e09b37bcc4"), "label", existing?.label, sbsI18n("swade-better-setting.UI.Emptyupgradeslot_f69df68d5c")],
    [sbsI18n("swade-better-setting.UI.Accepteditemtypes_28519a90cf"), "types", existing?.types?.join(", "), "container, backpack"],
    [sbsI18n("swade-better-setting.UI.Acceptedflags_6d95bb391a"), "flags", existing?.flags?.join(", "), "#vault, module.flag=value"]
  ];
  for (const [label, name, value, placeholder] of fields) {
    const input = document.createElement("input");
    Object.assign(input, {name, placeholder, defaultValue: value ?? ""});
    labelControl(document, content, label, input);
  }
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = sbsI18n("swade-better-setting.UI.SlotstakecontainersSeparateentrieswith_7834968043");
  content.append(hint);
  return dialog().prompt({window: {title: existing ? sbsI18n("swade-better-setting.UI.Editupgradeslot_8ffd22f466") : sbsI18n("swade-better-setting.UI.Addupgradeslot_98e641acdd")},
    classes: ["sbs-party-dialog"], content, rejectClose: false,
    ok: {label: existing ? sbsI18n("swade-better-setting.UI.Apply_31e392d1c0") : sbsI18n("swade-better-setting.UI.Add_9fd728c66c"), callback: (_event, button) => queued(() => {
      const {label, types, flags} = button.form.elements;
      const split = field => [...new Set(field.value.split(",").map(value => value.trim()).filter(Boolean))];
      const changes = {label: label.value.trim(), types: split(types).map(type => type.toLowerCase()), flags: split(flags)};
      const state = stateOf(party);
      if (existing) return save(party, {...state, slots: state.slots.map(slot => slot.id === id ? {...slot, ...changes} : slot)});
      const slot = {id: foundry.utils.randomID(), ...changes, visibility: "public", accessibility: "public", grants: {}};
      return save(party, {...state, slots: [...state.slots, slot]});
    })}});
}

function mountable(api, item, slot) {
  return api.acceptsContainer(item, slot) && !item.getFlag(MODULE_ID, "partyStorageRoot");
}

function mountContainer(party, id, item) {
  const api = gridApi();
  if (!game.user.isGM || !api) return;
  return queued(async () => {
    const state = stateOf(party);
    const slot = state.slots.find(row => row.id === id && !row.actorId);
    if (!slot || (item.actor && !item.pack && item.actor.items.get(item.id) !== item)) return;
    if (!mountable(api, item, slot)) throw new Error(sbsI18n("swade-better-setting.UI.Thisslotrequiresacontainerthat_ebb7049ed3"));
    if (api.hasContents(item)) throw new Error(sbsI18n("swade-better-setting.UI.Emptythecontainerbeforemountingit_2650109d15"));
    const config = item.flags[GRID]?.item?.container;
    const mounted = await mount(party, {...slot, visibility: config?.visibility ?? "public",
      accessibility: config?.accessibility ?? "public"}, item.toObject());
    try {
      await save(party, {...state, slots: state.slots.map(row => row.id === id ? mounted : row)});
      if (item.actor && !item.pack && !await item.delete()) throw new Error(sbsI18n("swade-better-setting.UI.Couldnotmovethecontainer_03776fd4cb"));
    } catch (error) {
      await save(party, state);
      await vaultActor(mounted)?.delete();
      throw error;
    }
  });
}

function chooseContainer(party, id) {
  const api = gridApi();
  if (!game.user.isGM || !api) return;
  const state = stateOf(party);
  const slot = state.slots.find(row => row.id === id && !row.actorId);
  if (!slot) return;
  const choices = [...recoveryItems(party), ...game.items].filter(item => mountable(api, item, slot) && !api.hasContents(item))
    .sort((a, b) => a.name.localeCompare(b.name)).map(item => ({key: item.uuid, name: item.name, img: item.img}));
  return new ChoicePicker({window: {title: sbsI18n("swade-better-setting.UI.Chooseacontainer_e9790067bc")}, classes: ["sbs-party-dialog"], choices, pageSize: 50,
    onSelect: async uuid => {
      const item = await fromUuid(uuid);
      if (item) await mountContainer(party, id, item);
    }}).render({force: true});
}

async function removeSlot(party, id) {
  if (!game.user.isGM) return;
  const initial = stateOf(party).slots.find(slot => slot.id === id);
  if (!initial) return;
  const ok = await dialog().confirm({window: {title: sbsI18n("swade-better-setting.UI.Removeupgradeslot_5f2dc47074")}, classes: ["sbs-party-dialog"],
    content: `<p>${sbsI18n("swade-better-setting.UI.Mountedstoragewillberemovedfrom_c1ca5a5b32")}</p>`, rejectClose: false});
  if (!ok) return;
  return queued(async () => {
    const state = stateOf(party);
    const slot = state.slots.find(row => row.id === id);
    if (!slot) return;
    const actor = vaultActor(slot);
    const retired = [...(state.retired ?? [])];
    if (actor) {
      const ownership = foundry.data.operators.ForcedReplacement.create({default: levels().NONE});
      if (!await actor.update({ownership})) throw new Error(sbsI18n("swade-better-setting.UI.Couldnotretirethevault_6c2d449073"));
      retired.push({actorId: slot.actorId, rootId: slot.rootId});
    }
    try {
      await save(party, {...state, retired, slots: state.slots.filter(row => row.id !== id)});
    } catch (error) {
      await syncOwnership(party, slot);
      throw error;
    }
  });
}

async function updateAccess(party, {slotId, visibility, accessibility, defaultOwnership, grants}) {
  if (!game.user.isGM || !modes.includes(visibility) || !modes.includes(accessibility)
    || !Number.isInteger(defaultOwnership) || defaultOwnership < levels().NONE || defaultOwnership > levels().OWNER) {
    throw new Error(sbsI18n("swade-better-setting.UI.Invalidvaultconfiguration_53a446d7c0"));
  }
  return queued(async () => {
    const state = stateOf(party);
    const current = state.slots.find(slot => slot.id === slotId);
    if (!current?.actorId) throw new Error(sbsI18n("swade-better-setting.UI.Thevaultisunavailable_dfe7b2bac0"));
    const clean = {};
    for (const player of game.users.filter(candidate => !candidate.isGM)) {
      const level = grants?.[player.id];
      if (Number.isInteger(level) && level >= levels().NONE && level <= levels().OWNER) clean[player.id] = level;
    }
    const next = {...current, visibility, accessibility, defaultOwnership, grants: clean};
    await syncOwnership(party, next);
    try {
      await save(party, {...state, slots: state.slots.map(slot => slot.id === slotId ? next : slot)});
    } catch (error) {
      await syncOwnership(party, current);
      throw error;
    }
    return true;
  });
}

function editAccess(party, slot) {
  if (!game.user.isGM) return;
  const doc = document;
  const wrapper = doc.createElement("div");
  const content = doc.createElement("div");
  content.className = "sbs-party-vault-access";
  wrapper.append(content);
  const select = (name, options, value) => {
    const control = doc.createElement("select");
    control.name = name;
    for (const [label, key] of options) {
      const selected = String(key) === String(value);
      control.add(new Option(label, key, selected, selected));
    }
    return control;
  };
  const choices = [[sbsI18n("swade-better-setting.UI.Public_591935b15b"), "public"], [sbsI18n("swade-better-setting.UI.Private_c63eb6720c"), "private"]];
  const ownershipChoices = [[sbsI18n("swade-better-setting.UI.None_dc937b5989"), 0], [sbsI18n("swade-better-setting.UI.Limited_e5125d9f63"), 1], [sbsI18n("swade-better-setting.UI.Observer_f20b6db009"), 2], [sbsI18n("swade-better-setting.UI.Owner_4b1b8aa360"), 3]];
  labelControl(doc, content, "Visibility", select("visibility", choices, slot.visibility));
  labelControl(doc, content, "Accessibility", select("accessibility", choices, slot.accessibility));
  const {NONE, OBSERVER, OWNER} = levels();
  const previousDefault = slot.visibility === "private" ? NONE : slot.accessibility === "private" ? OBSERVER : OWNER;
  labelControl(doc, content, "Ownership", select("defaultOwnership", ownershipChoices, slot.defaultOwnership ?? previousDefault));
  const hint = doc.createElement("p");
  hint.className = "hint";
  hint.textContent = sbsI18n("swade-better-setting.UI.Ownershipsetsthedefaultforparty_d1adf45792");
  const heading = doc.createElement("h3");
  heading.textContent = sbsI18n("swade-better-setting.UI.Playeroverrides_5cb368c7b5");
  content.append(hint, heading);
  const permissions = [[sbsI18n("swade-better-setting.UI.Inherit_3f72f03857"), ""], ...ownershipChoices];
  for (const player of game.users.filter(user => !user.isGM)) {
    labelControl(doc, content, player.name,
      select("grant-" + player.id, permissions, slot.grants?.[player.id] ?? ""));
  }
  return dialog().prompt({window: {title: slot.label + " · Access & ownership"}, classes: ["sbs-party-dialog"],
    content: wrapper, rejectClose: false, ok: {label: sbsI18n("swade-better-setting.UI.Apply_31e392d1c0"), callback: async (_event, button) => {
      const fields = new FormData(button.form);
      const grants = Object.fromEntries([...fields].filter(([name, value]) => name.startsWith("grant-") && value !== "")
        .map(([name, value]) => [name.slice(6), Number(value)]));
      const payload = {slotId: slot.id, visibility: fields.get("visibility"),
        accessibility: fields.get("accessibility"),
        defaultOwnership: Number(fields.get("defaultOwnership")),
        grants};
      return updateAccess(party, payload);
    }}});
}

export function registerPartyVaults() {
  game.settings.register(MODULE_ID, REGISTRY, {scope: "world", config: false, type: Object, default: {},
    onChange: () => {
      Hooks.callAll("sbsPartyInventoryChanged");
      for (const {party, refresh} of recoveryWindows.values()) refresh(party);
    }});
  for (const hook of [sbsI18n("swade-better-setting.UI.createItem_2be87307d5"), sbsI18n("swade-better-setting.UI.updateItem_fc765ef48a"), sbsI18n("swade-better-setting.UI.deleteItem_0259ed622a")]) Hooks.on(hook, item => {
    for (const {party, refresh} of recoveryWindows.values()) {
      if (item.actor === party || isVaultFor(party, item.actor?.uuid)) refresh(party);
    }
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (!changes.ownership || actor.type !== "group") return;
    if (isPartyVault(actor)) {
      if (!actor.testUserPermission(game.user, "OBSERVER")) {
        for (const app of foundry.applications.instances.values()) {
          if (app.document?.actor === actor && app.document.documentName === "Item") void app.close();
        }
      }
      return;
    }
    if (!game.users.activeGM?.isSelf) return;
    void queued(async () => {
      for (const slot of stateOf(actor).slots) await syncOwnership(actor, slot);
    }).catch(notify);
  });
  Hooks.on("createUser", () => {
    if (!game.users.activeGM?.isSelf) return;
    void queued(async () => {
      for (const id of Object.keys(registry())) {
        const party = game.actors.get(id);
        if (party) for (const slot of stateOf(party).slots) await syncOwnership(party, slot);
      }
    }).catch(notify);
  });
}

export function installPartyVaultPermissions() {
  // Limited vault access exposes artwork through its grid, not Foundry Item sheets or chat links.
  const prototype = CONFIG.Item.documentClass.prototype;
  const getUserLevel = prototype.getUserLevel;
  prototype.getUserLevel = function(user) {
    const level = getUserLevel.call(this, user);
    return level === levels().LIMITED && isPartyVault(this.parent) ? levels().NONE : level;
  };
}

export function prepareVaults(party, selected) {
  const api = gridApi();
  const state = stateOf(party);
  const vaults = state.slots.flatMap(slot => {
    const actor = vaultActor(slot);
    if (!slot.actorId) return game.user.isGM ? [{...slot, label: slot.label || sbsI18n("swade-better-setting.UI.Emptyupgradeslot_f69df68d5c"), empty: true}] : [];
    const grant = actor ? Math.min(access(party, slot, game.user), game.user.isGM ? levels().OWNER : actor.getUserLevel(game.user))
      : levels().NONE;
    const root = actor?.items.get(slot.rootId);
    const canOpen = grant >= levels().OBSERVER && !!root;
    const iconsOnly = grant === levels().LIMITED && slot.visibility === "public" && !!root;
    return [{...slot, label: root?.name || slot.containerName || slot.label || sbsI18n("swade-better-setting.UI.Vault_5d55c415e3"), img: canOpen || iconsOnly ? root.img : "",
      canOpen, canDrop: canOpen && grant === levels().OWNER, privateContents: !canOpen && !iconsOnly, iconsOnly}];
  });
  const mounted = vaults.filter(slot => !slot.empty);
  const single = mounted.find(slot => slot.id === selected);
  return {partyGrid: !!api && state.grid, partyGridAvailable: !!api && game.user.isGM,
    manageUpgrades: game.user.isGM, allVaults, showAllVaults: !single,
    vaults: vaults.map(slot => ({...slot, active: slot.id === single?.id})),
    visibleVaultActors: mounted.filter(slot => slot.canOpen).map(vaultActor),
    shownVaults: single ? [single] : mounted};
}

export function partyDepositVaults(party) {
  const {partyGrid, vaults} = prepareVaults(party);
  if (!partyGrid) return [];
  return vaults.filter(slot => slot.canDrop).map(slot => ({
    id: slot.id, label: slot.label, actor: vaultActor(slot),
    credit: callback => gridApi().creditPartyStorage(vaultActor(slot), slot.rootId, callback)
  }));
}

function recoveryItems(party) {
  const api = gridApi();
  const {slots, retired = []} = stateOf(party);
  const items = api.recoverableItems(party, partyRoot(party), true);
  for (const slot of [...slots, ...retired]) {
    const actor = vaultActor(slot);
    if (actor) items.push(...api.recoverableItems(actor, slot.rootId, retired.includes(slot)));
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function openRecovery(party) {
  const api = gridApi();
  if (!game.user.isGM || !api) return;
  const existing = recoveryWindows.get(party.id)?.window;
  if (existing?.rendered) return existing.bringToFront();
  const Dialog = dialog();
  const window = new Dialog({window: {title: sbsI18n("swade-better-setting.UI.Unplaceditems_872e5bc3b2"), resizable: true},
    position: {width: 430, height: 420}, classes: ["sbs-party-dialog"],
    content: `<div></div>`, buttons: [{action: "dismiss", label: sbsI18n("swade-better-setting.UI.Close_7d9eb7acb1")}]});
  await window.render({force: true});
  const doc = window.element.ownerDocument;
  const surface = doc.createElement("div");
  surface.className = "sgi-layout sbs-party-recovery";
  surface.dataset.sgiIntake = "";
  const list = doc.createElement("ul");
  list.className = "plain sbs-party-recovery-items";
  const hint = doc.createElement("p");
  hint.className = "hint";
  hint.textContent = sbsI18n("swade-better-setting.UI.Draggeartoavaultto_8a659a8910");
  surface.append(hint, list);
  window.element.querySelector(".dialog-content").replaceChildren(surface);

  const refresh = () => {
    const rows = recoveryItems(party).map(item => {
      const row = doc.createElement("li");
      const image = doc.createElement("img");
      image.src = item.img;
      image.alt = "";
      const button = doc.createElement("button");
      button.type = "button";
      button.draggable = true;
      button.className = "sbs-party-recovery-item";
      const quantity = item.system.quantity;
      const name = doc.createElement("span");
      name.textContent = quantity > 1 ? `${item.name} ×${quantity}` : item.name;
      const source = doc.createElement("small");
      source.textContent = item.actor?.name ?? "";
      button.append(image, name, source);
      button.addEventListener("click", () => item.sheet?.render({force: true}));
      button.addEventListener("dragstart", event => {
        event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
        event.dataTransfer.effectAllowed = "move";
      });
      row.append(button);
      return row;
    });
    if (!rows.length) {
      const empty = doc.createElement("li");
      empty.className = "hint";
      empty.textContent = sbsI18n("swade-better-setting.UI.Nounplaceditems_5a5a84d03b");
      rows.push(empty);
    }
    list.replaceChildren(...rows);
  };
  surface.addEventListener("dragover", event => {
    if (event.dataTransfer?.types.includes("text/plain")) event.preventDefault();
  });
  const drop = async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const {item, rotated} = await api.getPartyDrop(event);
      if (item) await api.unplacePartyItem(party, item, rotated);
    } catch (error) { notify(error); }
  };
  surface.addEventListener("drop", drop);
  surface.addEventListener("sgi-inventory-drop", drop);
  recoveryWindows.set(party.id, {party, window, refresh});
  window.addEventListener("close", () => recoveryWindows.delete(party.id), {once: true});
  refresh();
}

export const vaultActions = {
  toggle: app => toggleGrid(app.actor).catch(notify),
  add: app => editSlot(app.actor)?.catch(notify),
  configure: (app, id) => editSlot(app.actor, id)?.catch(notify),
  recovery: app => openRecovery(app.actor).catch(notify),
  choose: (app, id) => chooseContainer(app.actor, id)?.catch(notify),
  remove: (app, id) => removeSlot(app.actor, id).catch(notify),
  edit: (app, id) => {
    const slot = stateOf(app.actor).slots.find(row => row.id === id);
    if (slot) return editAccess(app.actor, slot)?.catch(notify);
  },
  open: (app, id) => {
    const slot = prepareVaults(app.actor, id).shownVaults.find(row => row.id === id);
    if (slot?.canOpen) return vaultActor(slot).items.get(slot.rootId)?.sheet?.render({force: true});
  }
};

export function isVaultFor(group, uuid) {
  const {slots, retired = []} = stateOf(group);
  return [...slots, ...retired].some(slot => "Actor." + slot.actorId === uuid);
}

export function renderPartyGrid(panel, app, {shownVaults}) {
  const api = gridApi();
  const group = app.actor;
  if (!api || !panel.querySelector(".sbs-party-vault-gallery")) return;
  for (const control of panel.querySelectorAll("[data-party-open-vault]")) {
    control.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      void vaultActions.open(app, control.dataset.vaultId);
    });
  }
  for (const surface of panel.querySelectorAll("[data-party-vault-drop]")) {
    // Grid Inventory's pointer pickup dispatches to native Grid drop surfaces.
    surface.dataset.sgiStowIn = surface.dataset.partyVaultDrop;
    surface.addEventListener("dragover", event => {
      if (!event.dataTransfer?.types.includes("text/plain")) return;
      event.preventDefault();
      event.stopPropagation();
      surface.classList.add("sbs-party-vault-drop-active");
    });
    surface.addEventListener("dragleave", event => {
      if (!surface.contains(event.relatedTarget)) surface.classList.remove("sbs-party-vault-drop-active");
    });
    const drop = event => {
      event.preventDefault();
      event.stopPropagation();
      surface.classList.remove("sbs-party-vault-drop-active");
      void (async () => {
        const {item, rotated} = await api.getPartyDrop(event);
        if (!item) return;
        const id = surface.dataset.partyVaultDrop;
        const slot = stateOf(group).slots.find(row => row.id === id);
        if (!slot) return;
        if (slot.actorId && access(group, slot, game.user) === levels().OWNER) {
          return api.placeInPartyStorage(vaultActor(slot), item, slot.rootId, rotated);
        }
        return mountContainer(group, id, item);
      })().catch(notify);
    };
    surface.addEventListener("drop", drop);
    surface.addEventListener("sgi-inventory-drop", drop);
  }
  const cleanups = [];
  for (const target of panel.querySelectorAll("[data-party-grid-contents]")) {
    const slot = shownVaults.find(row => row.id === target.dataset.partyGridContents);
    const actor = slot && vaultActor(slot);
    if (actor) cleanups.push(api.renderPartyStorage(target, app, actor, slot.rootId, {
      editable: slot.canDrop && actor.isOwner, privateContents: slot.privateContents, iconsOnly: slot.iconsOnly
    }));
  }
  return () => cleanups.forEach(cleanup => cleanup?.());
}

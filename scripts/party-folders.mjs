import {MODULE_ID} from "./skills.mjs";
import {isPartyVault} from "./party-vaults.mjs";
import {wrapMethod} from "./integrations.mjs";

const isParty = actor => actor?.type === "group" && !actor.pack && !isPartyVault(actor);
const memberType = actor => ["character", "npc"].includes(actor?.type);
export const partyFolder = party => game.folders.get(party.getFlag(MODULE_ID, "partyFolder"));

function inside(actor, folder) {
  for (let current = actor.folder; current; current = current.folder) if (current.id === folder.id) return true;
  return false;
}

export function folderMembers(party) {
  const folder = partyFolder(party);
  return folder ? game.actors.filter(actor => memberType(actor) && inside(actor, folder)) : [];
}

let queue = Promise.resolve();
function schedule(task) {
  const result = queue.then(task);
  queue = result.catch(error => console.error("Better Setting | Party folder", error));
  return result;
}
const authority = () => game.users.activeGM?.isSelf;

export async function ensurePartyFolder(party) {
  if (!isParty(party)) return;
  let folder = partyFolder(party);
  if (folder) {
    if (folder.folder) await folder.update({folder: null});
    return folder;
  }
  const previous = [...party.system.members.values()].map(row => row.actor).filter(actor => memberType(actor) && !actor.pack);
  folder = game.folders.find(folder => folder.type === "Actor" && folder.getFlag(MODULE_ID, "partyActor") === party.id)
    ?? await Folder.create({name: party.name, type: "Actor", folder: null, sorting: "a",
      flags: {[MODULE_ID]: {partyActor: party.id}}});
  await party.setFlag(MODULE_ID, "partyFolder", folder.id);
  // An Actor has one folder. Preserve a membership already established by
  // another party's folder when migrating older overlapping member lists.
  for (const actor of previous) {
    const assigned = game.actors.some(other => other !== party && isParty(other) &&
      partyFolder(other) && inside(actor, partyFolder(other)));
    if (!assigned) await actor.update({folder: folder.id});
  }
  return folder;
}

export async function movePartyMember(party, actor, remove = false) {
  const folder = partyFolder(party) ?? await schedule(() => ensurePartyFolder(party));
  if (!folder || !memberType(actor) || actor.pack) return false;
  await actor.update({folder: remove ? null : folder.id});
  return true;
}

function refreshParties() {
  for (const party of game.actors.filter(isParty)) {
    if (!party.getFlag(MODULE_ID, "partyFolder")) continue;
    party.reset();
    for (const app of Object.values(party.apps)) if (app.rendered) void app.render();
  }
  if (authority()) void schedule(async () => {
    for (const party of game.actors.filter(isParty)) {
      if (!party.getFlag(MODULE_ID, "partyFolder")) continue;
      const members = folderMembers(party).map(actor => actor.uuid).sort();
      const saved = [...party._source.system.members].sort();
      if (JSON.stringify(members) !== JSON.stringify(saved)) await party.update({"system.members": members});
    }
  });
  void ui.actors?.render();
}

export function pinPartyFolders(root) {
  const list = root.querySelector(".directory-list");
  if (!list) return false;
  for (const entry of list.querySelectorAll(".directory-item.entry[data-entry-id]")) {
    if (isPartyVault(game.actors.get(entry.dataset.entryId))) entry.classList.add("sbs-party-storage-entry");
  }
  let found = false;
  for (const party of game.actors.filter(isParty).sort((a, b) => b.sort - a.sort)) {
    const folder = partyFolder(party);
    const row = folder && list.querySelector(`[data-folder-id="${folder.id}"]`);
    if (!row) continue;
    found = true;
    row.classList.add("sbs-party-folder");
    const header = row.querySelector(":scope > .folder-header");
    if (party.testUserPermission(game.user, "LIMITED") && !header.querySelector(".sbs-open-party-sheet")) {
      const button = root.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "sbs-open-party-sheet icon fa-solid fa-sheet-plastic";
      button.setAttribute("aria-label", game.i18n.localize("SWADE.GroupSheet"));
      button.dataset.tooltipText = party.name;
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopImmediatePropagation();
        void party.sheet.render({force: true, focus: true});
      });
      const folderIcon = header.querySelector(":scope > i.fa-folder-open, :scope > i.fa-folder");
      if (folderIcon) folderIcon.replaceWith(button);
      else header.prepend(button);
    }
    list.querySelectorAll(`.directory-item.entry[data-entry-id="${party.id}"]`).forEach(entry => entry.remove());
    list.prepend(row);
  }
  return found;
}

export function installPartyFolders() {
  wrapMethod(CONFIG.Actor.dataModels.group.prototype, "prepareBaseData", function (original, ...args) {
    original(...args);
    if (isParty(this.parent) && this.parent.getFlag(MODULE_ID, "partyFolder")) {
      this.members = new Map(folderMembers(this.parent).map(actor => [actor.uuid, {actor}]));
    }
  });
  Hooks.on("createActor", actor => {
    if (isParty(actor) && authority()) void schedule(async () => { await ensurePartyFolder(actor); refreshParties(); });
    else if (actor.folder) refreshParties();
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (Object.hasOwn(changes, "folder")) refreshParties();
    if (isParty(actor) && changes.name && authority()) void schedule(async () => {
      const folder = partyFolder(actor);
      if (folder && folder.name !== actor.name) await folder.update({name: actor.name});
    });
  });
  Hooks.on("deleteActor", refreshParties);
  Hooks.on("updateFolder", (folder, changes) => {
    if (folder.type === "Actor" && Object.hasOwn(changes, "folder")) refreshParties();
    const party = game.actors.get(folder.getFlag(MODULE_ID, "partyActor"));
    if (isParty(party) && changes.folder && authority()) void schedule(() => folder.update({folder: null}));
    if (isParty(party) && changes.name && party.name !== folder.name && authority()) {
      void schedule(() => party.update({name: folder.name}));
    }
  });
  Hooks.on("deleteFolder", refreshParties);
  if (authority()) void schedule(async () => {
    for (const party of game.actors.filter(isParty)) await ensurePartyFolder(party);
    refreshParties();
  });
}

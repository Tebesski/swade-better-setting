import {MODULE_ID, PACK_ID, PACK_NAME, normalizeName, seedSkills, skillData} from "./skills.mjs";

let initialization;
let writes = Promise.resolve();
export const isPrimaryGM = () => game.users.activeGM?.id === game.user.id;
export const getPack = () => game.packs.get(PACK_ID);

export function initializeLibrary() {
  if (initialization) return initialization;
  initialization = initialize().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

async function initialize() {
  let pack = getPack();
  if (!isPrimaryGM()) return pack;
  if (!pack) {
    pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
      name: PACK_NAME, label: "Better Setting — Skills", type: "Item", system: "swade",
      ownership: {PLAYER: "OBSERVER", TRUSTED: "OBSERVER", ASSISTANT: "OWNER", GAMEMASTER: "OWNER"}
    });
  }
  if (!game.settings.get(MODULE_ID, "libraryInitialized")) {
    const existing = await pack.getDocuments();
    const source = await game.packs.get("swade.skills")?.getDocuments() ?? [];
    const names = new Set(existing.map(item => normalizeName(item.name)));
    const missing = seedSkills(source).filter(item => !names.has(normalizeName(item.name)));
    if (missing.length) {
      if (pack.locked) throw new Error("Unlock Better Setting — Skills to finish its initial setup.");
      await CONFIG.Item.documentClass.createDocuments(missing, {pack: pack.collection});
    }
    await game.settings.set(MODULE_ID, "libraryInitialized", true);
  }
  return pack;
}

export async function librarySkills() {
  await initializeLibrary();
  const pack = getPack();
  if (!pack) throw new Error("A GM must join once to set up the Better Setting skill compendium.");
  return (await pack.getDocuments()).filter(item => item.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
}

export function storeSkill(document) {
  const operation = writes.then(async () => {
    const pack = getPack();
    if (!game.user.isGM || !pack || pack.locked) throw new Error("A GM must unlock the Better Setting skill compendium to add this skill.");
    const skills = await librarySkills();
    const existing = skills.find(item => normalizeName(item.name) === normalizeName(document.name));
    if (existing) return existing;
    const data = skillData(document);
    data.name = data.name.trim();
    // Actor roll bonuses and other active effects must not become library defaults.
    data.system.die = structuredClone(document._source?.system?.die ?? data.system.die);
    return CONFIG.Item.documentClass.create(data, {pack: pack.collection});
  });
  writes = operation.catch(() => {});
  return operation;
}

export async function processPendingSkill(item) {
  if (!isPrimaryGM() || item.type !== "skill" || item.parent?.documentName !== "Actor" || !item.getFlag(MODULE_ID, "pendingLibrary")) return;
  try {
    await initializeLibrary();
    await storeSkill(item);
    await item.unsetFlag(MODULE_ID, "pendingLibrary");
  } catch (error) {
    console.error(`${MODULE_ID} | Could not save ${item.name} to the skill compendium`, error);
    ui.notifications.warn(`“${item.name}” is on the actor, but its compendium copy is pending. ${error.message}`);
  }
}

export async function processPendingSkills() {
  if (!isPrimaryGM()) return;
  const actors = new Set(game.actors.contents);
  for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.add(token.actor);
  for (const actor of actors) for (const item of actor.items) await processPendingSkill(item);
}

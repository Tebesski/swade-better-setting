import {t as sbsI18n} from "./i18n.mjs";
import {MODULE_ID, PACK_ID, PACK_NAME, normalizeName, seedSkills, skillData} from "./skills.mjs";

let initialization;
let writes = Promise.resolve();
const skillReads = new WeakMap();
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
      name: PACK_NAME, label: sbsI18n("swade-better-setting.UI.BetterSettingSkills_94dd9dc19b"), type: "Item", system: "swade",
      ownership: {PLAYER: "OBSERVER", TRUSTED: "OBSERVER", ASSISTANT: "OWNER", GAMEMASTER: "OWNER"}
    });
  }
  if (!game.settings.get(MODULE_ID, "libraryInitialized")) {
    const existing = await pack.getDocuments();
    const sourcePack = game.packs.get("swade-core-rules.swade-skills") ?? game.packs.get("swade.skills");
    const source = await sourcePack?.getDocuments() ?? [];
    const names = new Set(existing.map(item => normalizeName(item.name)));
    const missing = seedSkills(source).filter(item => !names.has(normalizeName(item.name)));
    if (missing.length) {
      if (pack.locked) throw new Error(sbsI18n("swade-better-setting.UI.UnlockBetterSettingSkillstofinish_0718101e4b"));
      await CONFIG.Item.documentClass.createDocuments(missing, {pack: pack.collection});
    }
    await game.settings.set(MODULE_ID, "libraryInitialized", true);
  }
  return pack;
}

export async function librarySkills() {
  await initializeLibrary();
  const pack = getPack();
  if (!pack) throw new Error(sbsI18n("swade-better-setting.UI.AGMmustjoinonceto_1154b937b4"));
  // Reuse Foundry's live document cache, not fresh database copies on every
  // picker refresh. Only fetch missing entries, sharing concurrent reads.
  let pending = skillReads.get(pack);
  if (!pending) {
    pending = (async () => {
      const index = await pack.getIndex();
      const ids = index.filter(entry => entry.type === "skill").map(entry => entry._id);
      const missing = ids.filter(id => !pack.has(id) && !pack.invalidDocumentIds?.has(id));
      if (missing.length) await pack.getDocuments({_id__in: missing});
      return ids;
    })();
    skillReads.set(pack, pending);
  }
  try {
    const ids = await pending;
    return ids.map(id => pack.get(id)).filter(item => item?.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    if (skillReads.get(pack) === pending) skillReads.delete(pack);
  }
}

export function storeSkill(document) {
  const operation = writes.then(async () => {
    const pack = getPack();
    if (!game.user.isGM || !pack || pack.locked) throw new Error(sbsI18n("swade-better-setting.UI.AGMmustunlocktheBetter_529492ae84"));
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
    ui.notifications.warn(sbsI18n("swade-better-setting.UI.isontheactorbutits_5b442e9088", {p0: (item.name), p1: (error.message)}));
  }
}

export async function processPendingSkills() {
  if (!isPrimaryGM()) return;
  const actors = new Set(game.actors.contents);
  for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.add(token.actor);
  for (const actor of actors) for (const item of actor.items) await processPendingSkill(item);
}

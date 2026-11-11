import {EFFECTS} from "./npc-data.mjs";
import {MODULE_ID, normalizeName, skillData, slug} from "./skills.mjs";
import {boundedRead} from "./bestiary-catalog.mjs";
import {isBasicSwadePack} from "./compendium-sources.mjs";

export function copyItem(item) {
  const data = skillData(item);
  data._id = foundry.utils.randomID();
  data.system.swid ||= slug(data.name);
  if (item.inCompendium) data._stats = {compendiumSource: item.uuid};
  return data;
}

export async function itemChoices(type, {generate = false} = {}) {
  const categorized = ["edge", "weapon", "armor"].includes(type);
  const fields = categorized ? ["system.category"] : generate ? ["system.rank", "system.pp", "system.damage",
    "system.trapping", "system.swid", `flags.${EFFECTS}.tags`] : [];
  const entry = (item, key, detail) => {
    const label = categorized ? game.i18n.localize(item.system?.category?.trim() || "Uncategorized") : "";
    return {key, name: item.name, img: item.img, detail, label, category: normalizeName(label), system: item.system, flags: item.flags};
  };
  const packs = game.packs.filter(pack => pack.visible && pack.documentName === "Item" && !isBasicSwadePack(pack));
  const indexed = await Promise.all(packs.map(async pack => {
    let index;
    try { index = await boundedRead(() => pack.getIndex({fields})); }
    catch (error) {
      console.warn(`${MODULE_ID} | Could not index ${pack.collection}`, error);
      index = pack.index;
    }
    return index.filter(item => item.type === type).map(item => entry(item, item.uuid ?? pack.getUuid(item._id), pack.title));
  }));
  const world = game.items.filter(item => item.type === type && item.visible).map(item => entry(item, item.uuid, "World items"));
  return [...world, ...indexed.flat()].sort((a, b) => a.name.localeCompare(b.name) || a.detail.localeCompare(b.detail));
}

export function itemCategories(rows) {
  const labels = [...new Map(rows.filter(row => row.category).map(row => [row.category, row.label]))];
  return labels.length > 1 ? Object.fromEntries(labels.sort((a, b) => a[1].localeCompare(b[1]))) : undefined;
}

export async function resolveItem(uuid, type) {
  const item = await foundry.utils.fromUuid(uuid);
  if (!item?.visible || item.type !== type) throw new Error("This item is no longer available.");
  return item;
}

export async function draggedLibraryItem(event) {
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data.type !== "Item" || !data.uuid) return null;
  const item = await foundry.utils.fromUuid(data.uuid);
  if (item?.documentName !== "Item" || !item.visible || item.isEmbedded || (item.pack && isBasicSwadePack({collection: item.pack}))) return null;
  return {key: item.uuid, name: item.name, img: item.img, type: item.type};
}

export async function tableChoices() {
  const rows = game.tables.filter(table => table.visible).map(table => ({key: table.uuid, name: table.name, img: table.img, detail: "World tables"}));
  const packs = game.packs.filter(pack => pack.visible && pack.documentName === "RollTable");
  const indexed = await Promise.all(packs.map(async pack => {
    const index = await boundedRead(() => pack.getIndex()).catch(() => pack.index);
    return index.map(table => ({key: pack.getUuid(table._id), name: table.name, img: table.img, detail: pack.title}));
  }));
  return [...rows, ...indexed.flat()].sort((a, b) => a.name.localeCompare(b.name));
}


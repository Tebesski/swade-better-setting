import {bounded} from "./npc-math.mjs";
import {normalizeName} from "./skills.mjs";

export const BETTER_POWERS = "swade-better-powers";
export const GENERAL_ENTRY = "general";

export function validEntryName(name) {
  const key = normalizeName(name);
  return !!key && !key.startsWith("-=") && !/[.\[\]{}]/.test(name) && !["__proto__", "constructor", "prototype"].includes(key);
}

export function addCastingEntry(entries, idFactory, {name, trait, points = 10} = {}) {
  const label = String(name ?? "").trim();
  const general = !label || normalizeName(label) === GENERAL_ENTRY;
  const display = general ? "General" : label;
  const existing = Object.values(entries).find(entry => normalizeName(entry.name) === normalizeName(display));
  if (existing) return existing;
  if (!validEntryName(display)) throw new Error("Spellcasting entry names must omit periods and brackets.");
  const id = general ? GENERAL_ENTRY : idFactory();
  const entry = {id, name: display, trait: String(trait ?? "").trim(), points: bounded(Math.trunc(Number(points)) || 0, 0, 999), rule: "inherit"};
  entries[id] = entry;
  return entry;
}

export function compileCasting(draft, items, idFactory) {
  const entries = {...draft.spellcasting};
  const assignments = {...draft.powerEntries};
  let signature = draft.signatureEntry;
  if (draft.mode === "power" && !entries[signature]) {
    signature = addCastingEntry(entries, idFactory, {name: draft.arcane || "Spellcasting", trait: draft.trait, points: draft.powerPoints}).id;
  }
  for (const item of items) if (item.type === "power" && !entries[assignments[item._id]]) {
    const name = validEntryName(item.system.arcane) ? item.system.arcane : "";
    const trait = item.system.actions?.trait || "Spellcasting";
    const points = Math.max(10, Number(item.system.pp) || 0);
    assignments[item._id] = addCastingEntry(entries, idFactory, {name, trait, points}).id;
  }
  const flags = Object.fromEntries(Object.values(entries).map(entry => [entry.id, {
    id: entry.id, name: entry.name, arcane: entry.id === GENERAL_ENTRY ? GENERAL_ENTRY : entry.name,
    trait: entry.trait, ...(["pp", "no-pp"].includes(entry.rule) ? {noPowerPoints: entry.rule === "no-pp"} : {})
  }]));
  const pools = {general: {value: 0, max: 0}};
  for (const entry of Object.values(entries)) pools[flags[entry.id].arcane] = {value: entry.points, max: entry.points};
  const assign = (system, entry) => entry ? {...system,
    arcane: entry.arcane === GENERAL_ENTRY ? "" : entry.arcane,
    actions: {...system.actions, trait: entry.trait}
  } : system;
  return {flags, pools, signature: flags[signature], apply: item => item.type === "power" ? {
    ...item, system: assign(item.system, flags[assignments[item._id]])
  } : item, assign};
}

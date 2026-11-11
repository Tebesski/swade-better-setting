import {normalizeName} from "./skills.mjs";

const EFFECTS_ID = "swade-better-effects";

export function npcNameSearch(query) {
  const text = normalizeName(query);
  if (!text.includes("*")) return name => normalizeName(name).includes(text);
  const parts = text.split(/\*+/u);
  const prefix = parts.shift();
  const suffix = parts.pop();
  return name => {
    const value = normalizeName(name);
    if (value.length < prefix.length + suffix.length || !value.startsWith(prefix) || !value.endsWith(suffix)) return false;
    let offset = prefix.length;
    const end = value.length - suffix.length;
    for (const part of parts) {
      const index = value.indexOf(part, offset);
      if (index < 0 || index + part.length > end) return false;
      offset = index + part.length;
    }
    return true;
  };
}

function sourceFlags(source, api) {
  if (api?.getFlags) return api.getFlags(source);
  const data = source.flags?.[EFFECTS_ID];
  const names = values => String(values ?? "").split(",").map(normalizeName).filter(Boolean);
  const excluded = new Set(names(data?.excludedTags));
  return names(data?.tags).filter(flag => !excluded.has(flag));
}

export function npcEffects(actor) {
  return new Set([...(actor.effects ?? []), ...(actor.allApplicableEffects?.() ?? []),
    ...Array.from(actor.items ?? []).flatMap(item => [...(item.effects ?? [])])]);
}

const effectChanges = effect => effect._source?.system?.changes ?? effect.system?.changes ?? effect.changes ?? [];

export function hasWoundAdjustment(actor) {
  return [...npcEffects(actor)].some(effect => !effect.disabled && effectChanges(effect).some(change =>
    change.key === "system.wounds" || change.key === "system.wounds.max"));
}

export function inWoundRange(value, min, max) {
  return Number.isInteger(value) && value >= min && (max === 3 || value <= max);
}

export function npcFacets(actor, effectsAPI) {
  const facets = new Map();
  const add = (type, name, img) => {
    const key = normalizeName(name);
    if (!key) return;
    if (!facets.has(type)) facets.set(type, new Map());
    const choices = facets.get(type);
    if (!choices.has(key)) choices.set(key, {key, name, img});
  };
  // Index each authored source separately, including effects that are inactive.
  // Pass only the fields needed to derive Better Effects' automatic flags.
  const addFlags = (source, documentName) => {
    const {type, name, flags, items, system = {}} = source;
    for (const flag of sourceFlags({documentName, type, name, flags, items, system}, effectsAPI)) add("flag", flag);
  };
  addFlags(actor, "Actor");
  if (actor.prototypeToken) addFlags(actor.prototypeToken, "Token");
  for (const item of actor.items ?? []) {
    if (["skill", "edge", "hindrance", "ability", "action"].includes(item.type)) add(item.type, item.name, item.img);
    if (item.type === `${EFFECTS_ID}.effect`) add("effect", item.name, item.img);
    for (const action of Object.values(item._source?.system?.actions?.additional ?? item.system?.actions?.additional ?? {})) {
      add("action", action.name, item.img);
    }
    addFlags(item, "Item");
  }
  for (const [key, stat] of Object.entries(actor.system?.additionalStats ?? {})) add("stat", stat?.label || key);
  for (const effect of npcEffects(actor)) {
    add("effect", effect.name, effect.img);
    addFlags(effect, "ActiveEffect");
    for (const change of effectChanges(effect)) {
      if (change.key === "sbe.modifyFlag" && change.type === "add") {
        add("flag", effectsAPI?.normalizeFlag?.(change.value) ?? change.value);
      }
    }
  }
  return facets;
}

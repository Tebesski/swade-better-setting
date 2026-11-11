import {MODULE_ID, normalizeName} from "./skills.mjs";
import {bounded} from "./npc-math.mjs";

export const MOVEMENT_MODES = {ground: "Walk", fly: "Fly", swim: "Swim", burrow: "Burrow"};
const MOVEMENT_DEFAULTS = {ground: 6, fly: 0, swim: 0, burrow: 0, run: 6, runMod: 0, paceBase: "ground"};
const movement = (id, label, fields) => ({id, label, ...MOVEMENT_DEFAULTS, ...fields});
const MOVEMENT_PRESETS = [
  movement("human", "Adult human", {}),
  movement("runner", "Fast human runner", {ground: 8, run: 8}),
  movement("child", "Child", {ground: 5, run: 4}),
  movement("snake", "Snake", {ground: 4, swim: 2, run: 4}),
  movement("eagle", "Eagle", {ground: 2, fly: 12, paceBase: "fly"}),
  movement("rat", "Rat", {ground: 6, swim: 2}),
  movement("badger", "Badger", {ground: 5, burrow: 3, run: 4}),
  movement("dolphin", "Dolphin", {ground: 0, swim: 10, paceBase: "swim"})
];

export function registerNPCPresets(archetypes) {
  for (const [key, defaults] of Object.entries({npcArchetypes: {}, npcMovement: MOVEMENT_PRESETS})) {
    game.settings.register(MODULE_ID, key, {scope: "world", config: false,
      type: Array.isArray(defaults) ? Array : Object, default: defaults});
  }
  standardArchetypes = archetypes;
}

let standardArchetypes;
export function archetypeLibrary() {
  return {...standardArchetypes, ...game.settings.get(MODULE_ID, "npcArchetypes")};
}

export const movementLibrary = () => game.settings.get(MODULE_ID, "npcMovement");
export const namedMovement = id => movementLibrary().find(row => row.id === id);
export const hasStandardArchetype = id => Object.hasOwn(standardArchetypes, id);
export const standardArchetype = id => structuredClone(standardArchetypes[id]);

let writes = Promise.resolve();
function updateLibrary(key, edit) {
  const operation = writes.then(() => {
    if (!game.user.isGM) throw new Error("Only a GM can manage NPC presets.");
    return game.settings.set(MODULE_ID, key, edit(structuredClone(game.settings.get(MODULE_ID, key))));
  });
  writes = operation.catch(() => {});
  return operation;
}

export function saveArchetype(id, profile) {
  return updateLibrary("npcArchetypes", rows => {
    if (Object.entries({...standardArchetypes, ...rows}).some(([key, row]) =>
      key !== id && normalizeName(row.label) === normalizeName(profile.label))) throw new Error("An archetype already uses that name.");
    return {...rows, [id]: profile};
  });
}

export function removeArchetype(id) {
  return updateLibrary("npcArchetypes", rows => {
    delete rows[id];
    return rows;
  });
}

export function movementValues(data) {
  const number = (key, min, max) => bounded(Math.trunc(Number(data[key])) || 0, min, max);
  return {ground: number("ground", 0, 100), fly: number("fly", 0, 100), swim: number("swim", 0, 100), burrow: number("burrow", 0, 100),
    run: [4, 6, 8, 10, 12].includes(Number(data.run)) ? Number(data.run) : 6, runMod: number("runMod", -20, 20),
    paceBase: Object.hasOwn(MOVEMENT_MODES, data.paceBase) ? data.paceBase : "ground"};
}

export function saveMovement(id, profile) {
  return updateLibrary("npcMovement", rows => {
    if (rows.some(row => row.id !== id && normalizeName(row.label) === normalizeName(profile.label))) throw new Error("A movement preset already uses that name.");
    return [...rows.filter(row => row.id !== id), {id, ...profile}];
  });
}

export function removeMovement(id) {
  return updateLibrary("npcMovement", rows => rows.filter(row => row.id !== id));
}

export function syncPresetSections(next, prior) {
  for (const section of next.querySelectorAll("details[data-section]")) {
    const previous = prior.querySelector(`details[data-section="${section.dataset.section}"]`);
    if (previous) section.open = previous.open;
  }
}

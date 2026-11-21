import {createHash} from "node:crypto";
import {effects} from "./gear-effects.mjs";
import {alchemy, storage, supplies} from "./gear-items.mjs";
import {clearCatalogPoisons, replaceCoating, restoreCondition, restorePowerPoints, wipeCatalogCoatings} from "./gear-macros.mjs";

const SETTING = "swade-better-setting";
const EFFECTS = "swade-better-effects";
const USABLES = "swade-better-usables";
const GRID = "swade-grid-inventory";
const source = "Better Setting";
const id = key => createHash("sha256").update(SETTING + ":" + key).digest("hex").slice(0, 16);
const uuid = (pack, type, key) => "Compendium." + SETTING + "." + pack + "." + type + "." + id(pack + ":" + key);
const effectUuid = key => uuid("effects", "Item", key);
const macroUuid = key => uuid("macros", "Macro", key);
const svg = name => "icons/svg/" + name + ".svg";
const paragraphs = text => "<p>" + text + "</p>";
const owner = {default: 2};

function folderId(pack, group) {
  return id(pack + ":folder:" + group);
}

function folder(pack, type, name, index) {
  return {_id: folderId(pack, name), name, type, sorting: "a", sort: (index + 1) * 100000};
}

function document(pack, key, name, type, img, group) {
  return {_id: id(pack + ":" + key), name, type, img, ownership: owner, ...(group && {folder: folderId(pack, group)})};
}

const effectGroup = data => data.family === "catalog-coating" ? "Weapon Finishes"
  : data.family === "catalog-poison" ? "Poisons & Consequences" : "Elixirs & Wards";

function outcome({progress = 0, damage = "", message = "", effect} = {}) {
  return {progress, damage, message, ...(effect && {effectUuid: effectUuid(effect)})};
}

function activeEffect(key, data) {
  const changes = (data.changes ?? []).map(({predicate, ...change}) => ({...change, phase: "initial", priority: null}));
  const conditions = (data.changes ?? []).map(({predicate}, index) => {
    const {key, type, value, phase, priority} = changes[index];
    return {signature: JSON.stringify([key, type, value, phase, priority]), predicate: predicate ?? {op: "all", children: []}};
  });
  const [value, units] = data.duration ?? [null, "rounds"];
  const duration = {value, units, expiry: data.expiry ?? (value && units === "rounds" ? "turnStart" : null)};
  const flags = {[EFFECTS]: {tags: data.tags, ...(conditions.length && {conditions})}};
  if (data.lingering) {
    const details = data.lingering;
    flags[EFFECTS].lingering = {
      enabled: true, timing: details.timing, trait: details.trait, tn: details.tn, required: details.required,
      outcomes: {
        fail: outcome(details.fail),
        success: outcome({progress: 1}),
        ...(details.critical && {critical: outcome(details.critical)})
      },
      raises: details.raise ? [{threshold: 1, ...outcome(details.raise)}] : []
    };
  }
  if (data.family) flags[SETTING] = {gearFamily: data.family};
  return {_id: id("active-effect:" + key), name: data.name, img: svg(data.icon), description: paragraphs(data.text),
    transfer: false, disabled: false, statuses: data.statuses ?? [], duration, flags,
    system: {changes, conditionalEffect: conditions.some(({predicate}) => predicate.op !== "all" || predicate.children.length)}};
}

const macroData = {
  "restore-condition": ["Restore Wounds or Fatigue", "heal", restoreCondition],
  "restore-pp": ["Restore Power Points", "lightning", restorePowerPoints],
  "clear-poisons": ["Clear Catalog Poisons", "poison", clearCatalogPoisons],
  "replace-coating": ["Replace Catalog Coating", "fire", replaceCoating],
  "wipe-coating": ["Remove Catalog Coating", "waterfall", wipeCatalogCoatings]
};

function behaviourSource({type, key, ...data}) {
  if (type === "effect") {
    if (!effects[key]) throw new Error("Unknown Gear effect: " + key);
    return {type, effectUuid: effectUuid(key), effectSource: [activeEffect(key, effects[key])], ...data};
  }
  if (type === "macro") {
    if (!macroData[key]) throw new Error("Unknown Gear macro: " + key);
    return {type, macroUuid: macroUuid(key), ...data};
  }
  return {type, ...data};
}

const charge = ({max = 1, rechargeType = "finite", rechargeAmount = ""} = {}) =>
  ({max, value: max, rechargeType, rechargeAmount});

function alchemicalItem(data) {
  const {name, icon, price, text, group, coatingFilter, tags = [], capacity = 1, reusable = false,
    uses = [{key: "use", name: coatingFilter ? "Apply" : "Use", behaviours: data.behaviours}],
    shared = true, width = 1, height = 1, weight = .25} = data;
  const kind = coatingFilter ? "coating" : group === "Poisons" ? "poison" : group === "Potions & Tonics" ? "potion" : "alchemical";
  const useConfig = {}, useBehaviours = {}, useDetails = {};
  const sharedPool = charge({max: capacity});
  const charges = uses.map((use, index) => {
    const useId = id(name + ":use:" + use.key);
    const {description = "", cost = 1, pool, details} = use;
    useConfig[useId] = {description, cost, separate: !!pool};
    useBehaviours[useId] = Object.fromEntries(use.behaviours.map((behaviour, index) =>
      [id(useId + ":behaviour:" + index), behaviourSource(behaviour)]));
    if (details) useDetails[useId] = details;
    return {id: useId, sort: index * 100000, name: use.name, ...(pool ? charge(pool) : sharedPool)};
  });
  const flags = [...new Set([kind, ...tags])];
  return {...document("gear", name, name, "consumable", "icons/consumables/potions/" + icon + ".webp", group),
    system: {description: paragraphs(text), source, category: group, quantity: 1, equipStatus: 1, price, weight,
      subtype: "regular", messageOnUse: true, destroyOnEmpty: !reusable, charges: {hasCharges: true, charges}},
    flags: {
      [SETTING]: {useDetails},
      [EFFECTS]: {tags: flags},
      [USABLES]: {shared, ...(shared && {sharedPool}), useConfig, uses: useBehaviours,
        ...(coatingFilter && {coating: true, coatingFilter}), sound: coatingFilter ? "sounds/lock.wav" : "sounds/notify.wav"},
      [GRID]: {item: {width, height, customType: kind, tags: flags, fillImage: true}}
    }};
}

function portableContainer(data) {
  const {name, icon, group, price, weight, equipped, size: [width, height], slot, type, shape: pattern, limit,
    mounts = [], layout = "grid", types = [], flags = [], text, sound = "wood", factor = 1} = data;
  const sounds = sound === "magic" ? {open: "sounds/doors/magic/door-open.ogg", close: "sounds/doors/magic/door-close.ogg"}
    : {open: "sounds/doors/" + sound + "/open.ogg", close: "sounds/doors/" + sound + "/close.ogg"};
  const colors = {wallet: "#a97d45", cashbox: "#a97d45", belt: "#9f744b", pouch: "#aa715c", sheath: "#9992a5", "kit-case": "#597c8d"};
  return {...document("gear", name, name, GRID + ".container", "icons/" + icon + ".webp", group),
    system: {description: paragraphs(text), source, category: group, equipStatus: 1, quantity: 1, price, weight},
    flags: {
      [EFFECTS]: {tags: ["container", type, ...(factor < 1 ? ["extradimensional"] : [])]},
      [GRID]: {equippedWeight: equipped, item: {width, height, ...(slot && {slot}), tags: ["container", type], customType: type,
        fillImage: true, slots: mounts, sounds: {...sounds, equip: "sounds/lock.wav"},
        container: {enabled: true, layout, pattern, limit, factor, types, flags, color: colors[type] ?? "#589287"}}}
    }};
}

function ordinaryGear({name, icon, type = "gear", price, weight, size: [width, height], tags, system, text}) {
  const group = "Field Gear";
  return {...document("gear", name, name, type, "icons/" + icon + ".webp", group),
    system: {description: paragraphs(text), source, category: group, price, weight, equipStatus: 1, quantity: 1, ...system},
    flags: {[EFFECTS]: {tags}, [GRID]: {item: {width, height, tags, fillImage: true}}}};
}

export const catalog = {
  gear: {
    collection: "items",
    folders: [...new Set([...alchemy, ...storage].map(entry => entry.group)), "Field Gear"]
      .map((name, index) => folder("gear", "Item", name, index)),
    documents: [...alchemy.map(alchemicalItem), ...storage.map(portableContainer), ...supplies.map(ordinaryGear)]
  },
  effects: {
    collection: "items",
    folders: ["Elixirs & Wards", "Poisons & Consequences", "Weapon Finishes"].map((name, index) => folder("effects", "Item", name, index)),
    documents: Object.entries(effects).map(([key, data]) => ({
      ...document("effects", key, data.name, EFFECTS + ".effect", svg(data.icon), effectGroup(data)),
      system: {description: paragraphs(data.text)}, effects: [activeEffect(key, data)]
    }))
  },
  macros: {
    collection: "macros",
    folders: [],
    documents: Object.entries(macroData).map(([key, [name, icon, command]]) => ({
      ...document("macros", key, name, "script", svg(icon)),
      scope: "global", command: "return (" + command.toString() + ")(actor, scope);"
    }))
  }
};

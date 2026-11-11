const RAISE_DICE = {4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12"};
const LOCATIONS = {0: "Stored", 1: "Carried", 2: "Off-Hand", 3: "Equipped", 4: "Main Hand", 5: "Two Hands"};
const RELOADS = {none: "None", self: "Self", single: "Single round", full: "Full reload", magazine: "Magazine", battery: "Battery", pp: "Power Points"};
const TEMPLATES = {small: "Small Blast", medium: "Medium Blast", large: "Large Blast", scone: "Small Cone", cone: "Cone", stream: "Stream"};

const DAMAGE_FIELDS = [
  {path: "bonusDamageDice", label: "Raise dice", type: "number", min: 0, max: 12, initial: 1},
  {path: "bonusDamageDie", label: "Raise die", choices: RAISE_DICE, numeric: true, initial: 6},
  {path: "actions.traitMod", label: "Trait modifier"},
  {path: "actions.dmgMod", label: "Damage modifier"}
];
const WEAPON_FIELDS = [
  {path: "equipStatus", label: "Location", choices: LOCATIONS, numeric: true, initial: 3},
  {path: "minStr", label: "Min. Strength"},
  {path: "parry", label: "Parry bonus", type: "number", min: -12, max: 24, initial: 0},
  {path: "trademark", label: "Trademark", choices: {0: "None", 1: "Regular (+1)", 2: "Improved (+2)"}, numeric: true, initial: 0},
  {path: "isHeavyWeapon", label: "Heavy Weapon", type: "checkbox"}
];
const RANGED_FIELDS = [
  {magazine: true},
  {path: "ammo", label: "Ammo"},
  {path: "reloadType", label: "Reload", choices: RELOADS, initial: "none"}
];

export function attackDetails(key, {system, weapon, ranged, tiny, tags}) {
  const fields = [
    ...DAMAGE_FIELDS.filter(field => !tiny || !field.path.startsWith("bonusDamage")),
    ...(weapon ? WEAPON_FIELDS : []),
    ...(ranged ? RANGED_FIELDS : []),
    ...(ranged && system.reloadType === "pp" ? [{path: "ppReloadCost", label: "Reload PP", type: "number", min: 0, max: 999, initial: 2}] : [])
  ];
  const templates = Object.entries(TEMPLATES).map(([name, label]) => ({name, label, enabled: system.templates?.[name]}));
  return {key, tags, templates, fields: fields.map(field => {
    if (field.magazine) return {...field, loaded: system.currentShots ?? 0, capacity: system.shots ?? 0};
    const value = field.path.split(".").reduce((object, part) => object?.[part], system);
    return {...field, type: field.type ?? "text", value: value ?? field.initial};
  })};
}

export function setMagazineField(system, field, value) {
  const capacity = system.shots ?? 0;
  const loaded = system.currentShots ?? 0;
  if (field === "shots") {
    system.shots = value;
    // A full magazine stays full. A partially loaded one keeps its count up to the new capacity.
    system.currentShots = loaded === capacity ? value : Math.min(loaded, value);
  } else system.currentShots = Math.min(value, capacity);
}

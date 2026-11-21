import {t as sbsI18n} from "./i18n.mjs";
const RAISE_DICE = {4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12"};
const LOCATIONS = {get 0() { return sbsI18n("swade-better-setting.UI.Stored_91da962689"); }, get 1() { return sbsI18n("swade-better-setting.UI.Carried_4014b8870c"); }, get 2() { return sbsI18n("swade-better-setting.UI.OffHand_a7bac73edb"); }, get 3() { return sbsI18n("swade-better-setting.UI.Equipped_c4dc8a3877"); }, get 4() { return sbsI18n("swade-better-setting.UI.MainHand_ed3897f136"); }, get 5() { return sbsI18n("swade-better-setting.UI.TwoHands_e3e5ec9b38"); }};
const RELOADS = {get none() { return sbsI18n("swade-better-setting.UI.None_dc937b5989"); }, get self() { return sbsI18n("swade-better-setting.UI.Self_85bc0f9585"); }, get single() { return sbsI18n("swade-better-setting.UI.Singleround_0e059fc1c0"); }, get full() { return sbsI18n("swade-better-setting.UI.Fullreload_bddb1c8b9a"); }, get magazine() { return sbsI18n("swade-better-setting.UI.Magazine_9042ee84d0"); }, get battery() { return sbsI18n("swade-better-setting.UI.Battery_dfcb7c1619"); }, get pp() { return sbsI18n("swade-better-setting.UI.PowerPoints_844847817f"); }};
const TEMPLATES = {get small() { return sbsI18n("swade-better-setting.UI.SmallBlast_6713fa0daf"); }, get medium() { return sbsI18n("swade-better-setting.UI.MediumBlast_be37ac5399"); }, get large() { return sbsI18n("swade-better-setting.UI.LargeBlast_e4d5086259"); }, get scone() { return sbsI18n("swade-better-setting.UI.SmallCone_ca1d9de011"); }, get cone() { return sbsI18n("swade-better-setting.UI.Cone_3b5ebcbf43"); }, get stream() { return sbsI18n("swade-better-setting.UI.Stream_1eec3071dd"); }};

const DAMAGE_FIELDS = [
  {path: "bonusDamageDice", get label() { return sbsI18n("swade-better-setting.UI.Raisedice_a9a43a468a"); }, type: "number", min: 0, max: 12, initial: 1},
  {path: "bonusDamageDie", get label() { return sbsI18n("swade-better-setting.UI.Raisedie_20b7a777f0"); }, choices: RAISE_DICE, numeric: true, initial: 6},
  {path: "actions.traitMod", get label() { return sbsI18n("swade-better-setting.UI.Traitmodifier_ff87ba5302"); }},
  {path: "actions.dmgMod", get label() { return sbsI18n("swade-better-setting.UI.Damagemodifier_bc0d310cd9"); }}
];
const WEAPON_FIELDS = [
  {path: "equipStatus", get label() { return sbsI18n("swade-better-setting.UI.Location_15b61974b2"); }, choices: LOCATIONS, numeric: true, initial: 3},
  {path: "minStr", get label() { return sbsI18n("swade-better-setting.UI.MinStrength_2bd199a333"); }},
  {path: "parry", get label() { return sbsI18n("swade-better-setting.UI.Parrybonus_086f2163c3"); }, type: "number", min: -12, max: 24, initial: 0},
  {path: "trademark", get label() { return sbsI18n("swade-better-setting.UI.Trademark_c3d627776b"); }, choices: {get 0() { return sbsI18n("swade-better-setting.UI.None_dc937b5989"); }, get 1() { return sbsI18n("swade-better-setting.UI.Regular1_54f0637608"); }, get 2() { return sbsI18n("swade-better-setting.UI.Improved2_0d194ddc30"); }}, numeric: true, initial: 0},
  {path: "isHeavyWeapon", get label() { return sbsI18n("swade-better-setting.UI.HeavyWeapon_bc2d874a72"); }, type: "checkbox"}
];
const RANGED_FIELDS = [
  {magazine: true},
  {path: "ammo", get label() { return sbsI18n("swade-better-setting.UI.Ammo_c16338e2b0"); }},
  {path: "reloadType", get label() { return sbsI18n("swade-better-setting.UI.Reload_bdc090ec61"); }, choices: RELOADS, initial: "none"}
];

export function attackDetails(key, {system, weapon, ranged, tiny, tags}) {
  const fields = [
    ...DAMAGE_FIELDS.filter(field => !tiny || !field.path.startsWith("bonusDamage")),
    ...(weapon ? WEAPON_FIELDS : []),
    ...(ranged ? RANGED_FIELDS : []),
    ...(ranged && system.reloadType === "pp" ? [{path: "ppReloadCost", label: sbsI18n("swade-better-setting.UI.ReloadPP_fc25b1e13b"), type: "number", min: 0, max: 999, initial: 2}] : [])
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

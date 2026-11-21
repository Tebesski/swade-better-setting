import {t as sbsI18n} from "./i18n.mjs";
export const MODULE_ID = "swade-better-setting";
export const PACK_NAME = "better-setting-skills";
export const PACK_ID = `world.${PACK_NAME}`;
export const ICON = "systems/swade/assets/icons/skill.svg";

// Names and linked attributes only; descriptions are taken from the installed system.
export const STANDARD_SKILLS = [
  [sbsI18n("swade-better-setting.UI.Academics_21de0aaf79"), "smarts"], [sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), "agility", true], [sbsI18n("swade-better-setting.UI.Battle_1b18ebbc3f"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Boating_18761524b7"), "agility"], [sbsI18n("swade-better-setting.UI.CommonKnowledge_7bc3c7798a"), "smarts", true], [sbsI18n("swade-better-setting.UI.Driving_d61f3033cb"), "agility"],
  [sbsI18n("swade-better-setting.UI.Electronics_7ae9c23d65"), "smarts"], [sbsI18n("swade-better-setting.UI.Faith_403109cf24"), "spirit"], [sbsI18n("swade-better-setting.UI.Fighting_21e2e5c54b"), "agility"],
  [sbsI18n("swade-better-setting.UI.Focus_9d3cab2b5e"), "spirit"], [sbsI18n("swade-better-setting.UI.Gambling_a34a9dc897"), "smarts"], [sbsI18n("swade-better-setting.UI.Hacking_04a766309d"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Healing_44bc379989"), "smarts"], [sbsI18n("swade-better-setting.UI.Intimidation_5459202ae7"), "spirit"], [sbsI18n("swade-better-setting.UI.Language_a4fe65264e"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Notice_6565914556"), "smarts", true], [sbsI18n("swade-better-setting.UI.Occult_c18a5bc0f8"), "smarts"], [sbsI18n("swade-better-setting.UI.Performance_442aded87a"), "spirit"],
  [sbsI18n("swade-better-setting.UI.Persuasion_196fbdc5f1"), "spirit", true], [sbsI18n("swade-better-setting.UI.Piloting_025fbd244e"), "agility"], [sbsI18n("swade-better-setting.UI.Psionics_dda3bc3777"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Repair_1196b6c538"), "smarts"], [sbsI18n("swade-better-setting.UI.Research_979d6300fd"), "smarts"], [sbsI18n("swade-better-setting.UI.Riding_e9d7b76127"), "agility"],
  [sbsI18n("swade-better-setting.UI.Science_9d948c73e0"), "smarts"], [sbsI18n("swade-better-setting.UI.Shooting_fc7cbc901b"), "agility"], [sbsI18n("swade-better-setting.UI.Spellcasting_0ce3a662d1"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Stealth_526a40a447"), "agility", true], [sbsI18n("swade-better-setting.UI.Survival_8302496de0"), "smarts"], [sbsI18n("swade-better-setting.UI.Taunt_aa1c342dae"), "smarts"],
  [sbsI18n("swade-better-setting.UI.Thievery_2749beeaa3"), "agility"], [sbsI18n("swade-better-setting.UI.WeirdScience_bb4f550cb9"), "smarts"]
];

export const normalizeName = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
export const slug = value => normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, "-");

export function skillData(document) {
  const data = document.toObject ? document.toObject() : structuredClone(document);
  for (const key of ["_id", "_stats", "folder", "sort", "ownership"]) delete data[key];
  if (data.flags && data.type === "skill") delete data.flags[MODULE_ID];
  return data;
}

export function seedSkills(source = []) {
  return STANDARD_SKILLS.map(([name, attribute, isCoreSkill = false]) => {
    const original = source.find(item => item.type === "skill" &&
      (normalizeName(item.name) === normalizeName(name) || item.system?.swid === slug(name)));
    const data = original ? skillData(original) : {name, type: "skill", img: ICON, system: {swid: slug(name), attribute}};
    data.system.isCoreSkill = isCoreSkill;
    return data;
  });
}

export function withCoreSkills(items, coreSkills, idFactory) {
  const result = structuredClone(items);
  const names = new Set(items.filter(item => item.type === "skill").map(item => normalizeName(item.name)));
  const swids = new Set(items.filter(item => item.type === "skill").map(item => item.system?.swid).filter(Boolean));
  for (const skill of coreSkills) {
    if (names.has(normalizeName(skill.name)) || (skill.system?.swid && swids.has(skill.system.swid))) continue;
    const data = skillData(skill);
    data._id = idFactory();
    result.push(data);
    names.add(normalizeName(data.name));
    if (data.system?.swid) swids.add(data.system.swid);
  }
  return result;
}

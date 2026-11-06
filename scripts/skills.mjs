export const MODULE_ID = "swade-better-setting";
export const PACK_NAME = "better-setting-skills";
export const PACK_ID = `world.${PACK_NAME}`;
export const ICON = "systems/swade/assets/icons/skill.svg";

// Names and linked attributes only; descriptions are taken from the installed system.
export const STANDARD_SKILLS = [
  ["Academics", "smarts"], ["Athletics", "agility", true], ["Battle", "smarts"],
  ["Boating", "agility"], ["Common Knowledge", "smarts", true], ["Driving", "agility"],
  ["Electronics", "smarts"], ["Faith", "spirit"], ["Fighting", "agility"],
  ["Focus", "spirit"], ["Gambling", "smarts"], ["Hacking", "smarts"],
  ["Healing", "smarts"], ["Intimidation", "spirit"], ["Language", "smarts"],
  ["Notice", "smarts", true], ["Occult", "smarts"], ["Performance", "spirit"],
  ["Persuasion", "spirit", true], ["Piloting", "agility"], ["Psionics", "smarts"],
  ["Repair", "smarts"], ["Research", "smarts"], ["Riding", "agility"],
  ["Science", "smarts"], ["Shooting", "agility"], ["Spellcasting", "smarts"],
  ["Stealth", "agility", true], ["Survival", "smarts"], ["Taunt", "smarts"],
  ["Thievery", "agility"], ["Weird Science", "smarts"]
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

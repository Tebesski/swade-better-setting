import {EFFECTS, rankIndex} from "./npc-data.mjs";
import {slug} from "./skills.mjs";

export const POWER_THEMES = {random: "Random mix", battle: "Battle", protection: "Protection", restoration: "Restoration",
  control: "Control", trickery: "Trickery", exploration: "Exploration"};

const themes = {
  battle: /bolt|blast|burst|damage|smite|attack|weapon|fire|lightning|drain|havoc/,
  protection: /protect|armor|armour|deflect|barrier|resistan|ward|shield|conceal|immunity/,
  restoration: /heal|relief|restor|resurrect|rejuven|remedy|cure|dispel|succor/,
  control: /bind|entangle|puppet|fear|stun|slumber|slow|havoc|confus|banish|barrier|lower|darkness/,
  trickery: /illusion|disguise|invisib|confus|puppet|fear|decoy|conceal|obscure|darkness|shape.change/
};
const exploration = /\b(?:exploration|detect|light|illuminate|sight|vision|farsight|languages?|fly|flight|speed|teleport(?:ation)?|burrow|environment(?:al)?|locate|divination|navigation|tracking|object-reading|invisibility|intangibility|wall-walker|beast-friend)\b/u;

export const powerKey = item => slug(item.system?.swid || item.name);

export function powerCandidates(items, {rank, theme, existing, canCast}) {
  const limit = rankIndex(rank);
  const seen = new Set(existing.map(powerKey));
  const eligible = [];
  for (const item of items) {
    const system = item.system;
    if (!system) continue;
    const required = rankIndex(system.rank || "Novice");
    const key = powerKey(item);
    if (!key || seen.has(key) || required < 0 || required > limit || !canCast(Math.max(0, Number(system.pp) || 0))) continue;
    const tags = item.flags?.[EFFECTS]?.tags;
    if (theme === "exploration" && (String(system.damage ?? "").trim() ||
      !exploration.test(slug([item.name, system.swid, tags].filter(Boolean).join(" "))))) continue;
    if (themes[theme] && !themes[theme].test(slug([item.name, system.swid, system.trapping, tags].filter(Boolean).join(" ")))) continue;
    seen.add(key);
    eligible.push(item);
  }
  return eligible;
}

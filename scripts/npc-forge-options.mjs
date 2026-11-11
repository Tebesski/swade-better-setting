import {bounded, RANKS} from "./npc-math.mjs";
import {normalizeName} from "./skills.mjs";

export function variantRoll(seed, key) {
  let hash = 2166136261;
  for (const char of `${seed}/${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

const rankNumber = value => RANKS.findIndex(rank => normalizeName(rank) === normalizeName(value));

export function chooseLoadout(rows, rank, seed, accepts = () => true) {
  const tier = rankNumber(rank);
  const slots = new Map();
  const result = [];
  for (const row of rows) {
    const first = rankNumber(row.rank);
    const last = rankNumber(row.maxRank);
    const key = row.id ?? row.uuid;
    if (tier < first || (last >= 0 && tier > last) || !accepts(row)) continue;
    if (variantRoll(seed, key) * 100 >= (row.chance ?? 100)) continue;
    const slot = normalizeName(row.slot);
    if (!slot) { result.push(row); continue; }
    const variants = slots.get(slot) ?? new Map();
    slots.set(slot, variants);
    const kit = normalizeName(row.kit) || key;
    const option = variants.get(kit) ?? {weight: 0, rows: []};
    variants.set(kit, option);
    option.weight = Math.max(option.weight, row.weight ?? 1);
    option.rows.push(row);
  }
  for (const [slot, variants] of slots) {
    const options = [...variants.values()];
    let pick = variantRoll(seed, `slot:${slot}`) * options.reduce((sum, kit) => sum + kit.weight, 0);
    for (const option of options) {
      pick -= option.weight;
      if (pick < 0) { result.push(...option.rows); break; }
    }
  }
  // A duplicate source in a fixed slot and a pool should only be granted once.
  return [...new Map(result.map(row => [row.uuid, row])).values()];
}

export function limitAncestryDie(die, range, anomalyChance, seed, attribute, shiftDie = true) {
  if (!range?.min && !range?.max && !range?.anomaly) return die;
  const rangeOffset = range.anomaly && variantRoll(seed, `anomaly:${attribute}`) * 100 < anomalyChance
    ? (variantRoll(seed, `direction:${attribute}`) < .5 ? -1 : 1) *
      (1 + Math.floor(variantRoll(seed, `magnitude:${attribute}`) * range.anomaly)) : 0;
  const min = range.min ? bounded(range.min + 2 * rangeOffset, 4, 12) : 4;
  const max = range.max ? bounded(range.max + 2 * rangeOffset, min, 12) : Infinity;
  const sides = bounded(die.sides + (shiftDie && !range.min && !range.max ? 2 * rangeOffset : 0), min, max);
  return {...die, sides, modifier: Number.isFinite(max) && sides === max ? Math.min(die.modifier ?? 0, 0) : die.modifier};
}

export function spendAttributeSteps(attributes, weights, steps, seed, limit = (_key, die) => die) {
  const result = {...attributes};
  for (let step = 0; step < steps; step++) {
    const choices = Object.entries(result).flatMap(([key, die]) => {
      const weight = Number(weights?.[key]) || 0;
      if (weight <= 0 || die.sides >= 12) return [];
      const next = limit(key, {...die, sides: die.sides + 2});
      return next.sides > die.sides ? [{key, die: next, weight}] : [];
    });
    if (!choices.length) break;
    let pick = variantRoll(seed, `attribute:${step}`) * choices.reduce((sum, row) => sum + row.weight, 0);
    for (const choice of choices) {
      pick -= choice.weight;
      if (pick < 0) { result[choice.key] = choice.die; break; }
    }
  }
  return result;
}

export const CASTING_RULES = {inherit: "World setting", pp: "Use Power Points", "no-pp": "No Power Points"};
export function readCasting(values, rows) {
  const read = key => String(values.get(key) ?? "").trim();
  return rows.map((entry, index) => ({...entry, name: read(`casting-name-${index}`), trait: read(`casting-trait-${index}`),
    points: bounded(Math.trunc(Number(read(`casting-points-${index}`))) || 0, 0, 999),
    growth: bounded(Math.trunc(Number(read(`casting-growth-${index}`))) || 0, 0, 99),
    rule: read(`casting-rule-${index}`) || "inherit"}));
}

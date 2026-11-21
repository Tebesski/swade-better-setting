export const IMPROVISED_PRESETS = Object.freeze({
  light: {range: "3/6/12", damage: "@str+1d4", minStr: "d4", examples: ["Stein", "Rock", "Pistol"]},
  medium: {range: "2/4/8", damage: "@str+1d6", minStr: "d6", examples: ["BowlingBall", "SubmachineGun", "WoodenChair"]},
  heavy: {range: "1/2/4", damage: "@str+1d8", minStr: "d8", examples: ["LargeRock", "MetalChair", "DuffelBag"]}
});

// Practical estimates in pounds; the constructor remains editable.
export const IMPROVISED_WEIGHTS = Object.freeze({Stein: 2, Rock: 1, Pistol: 3,
  BowlingBall: 12, SubmachineGun: 7, WoodenChair: 10, LargeRock: 15, MetalChair: 15, DuffelBag: 30});

export const IMPROVISED_ICONS = Object.freeze({
  Stein: "icons/consumables/drinks/alcohol-beer-stein-wooden-metal-brown.webp",
  Rock: "icons/commodities/stone/rock-chunk-grey.webp",
  Pistol: "icons/weapons/guns/gun-pistol-brown.webp",
  SubmachineGun: "icons/weapons/guns/machine-gun-sub-pistol.webp",
  Stool: "icons/commodities/wood/furniture-stool-brown.webp",
  LargeRock: "icons/commodities/stone/stone-cratered-brown.webp",
  DuffelBag: "icons/containers/bags/sack-canvas-grey.webp",
  Club: "icons/weapons/clubs/club-banded-brown.webp",
  Bottle: "icons/containers/kitchenware/vase-bottle-brown.webp",
  Hammer: "icons/tools/hand/hammer-simple-wood.webp"
});

export function improvisedSource(values, normalize = text => String(text).trim().toLowerCase().replace(/\s+/g, "-")) {
  const penalty = Number(values.penalty), ap = Number(values.ap), weight = Number(values.weight);
  if (!values.name.trim() || !values.damage.trim() || !values.trait.trim()) throw new Error("Incomplete");
  if (![penalty, ap, weight].every(Number.isFinite) || ap < 0 || weight < 0) throw new Error("Numbers");
  const ranges = values.range.split("/").map(Number);
  if (ranges.length !== 3 || ranges.some((n, i) => !Number.isFinite(n) || n <= 0 || i && n < ranges[i - 1])) throw new Error("Range");
  return {name: values.name.trim(), type: "weapon", img: String(values.img ?? "").trim() || "systems/swade/assets/icons/weapon.svg",
    system: {damage: values.damage.trim(), range: values.range.trim(), minStr: values.minStr, rangeType: 2, equipStatus: 4,
      quantity: 1, weight, ap, favorite: true, actions: {trait: values.trait.trim(), traitMod: String(penalty),
        additional: {throw: {name: values.throwLabel, type: "trait", override: values.throwTrait, modifier: "0"}}}},
    flags: {"swade-better-setting": {improvisedWeapon: true}, "swade-better-effects": {
      tags: [...new Set(["improvised-weapon", ...String(values.flags ?? "").split(",").map(normalize).filter(Boolean)])]}}};
}
